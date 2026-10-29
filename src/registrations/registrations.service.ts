import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  Attendance,
  AttendanceDocument,
} from 'src/attendance/schemas/attendance.schema';
import { EventsService } from 'src/events/events.service';
import { ParticipantsService } from 'src/participants/participants.service';
import { PaymentRequiredException } from 'src/payments/exceptions/payment-required.exception';
import { PaymentIntentsRepository } from 'src/payments/repositories/payment-intents.repository';
import {
  normalizeFeexpayStatus,
  PaymentsService,
} from 'src/payments/payments.service';
import { ParticipantGender } from 'src/participants/schemas/participant.schema';
import { PaginatedResult } from 'src/common/interfaces/paginated-result.interface';
import { QrcodeService } from 'src/qrcode/qrcode.service';
import { MailService } from 'src/mail/mail.service';
import { AdminRattrapageDto } from './dto/admin-rattrapage.dto';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { PublicRegisterDto } from './dto/public-register.dto';
import { QueryRegistrationsDto } from './dto/query-registrations.dto';
import { UpdateRegistrationStatusDto } from './dto/update-registration-status.dto';
import {
  buildRegistrationsPdfBuffer,
  RegistrationsPdfRow,
} from './pdf-report.util';
import { CountersRepository } from './repositories/counters.repository';
import { RegistrationsRepository } from './repositories/registrations.repository';
import {
  Registration,
  RegistrationDocument,
  RegistrationStatus,
} from './schemas/registration.schema';

const DEFAULT_REGISTRATION_PREFIX = 'EBEN';

const PAYMENT_NETWORK_LABELS: Record<string, string> = {
  mtn: 'MTN',
  moov: 'Moov',
  celtiis_bj: 'Celtiis',
};

interface ParticipantInfo {
  firstName?: string;
  lastName?: string;
  gender?: string;
  dob?: Date;
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
  church?: string;
  title?: string;
  profession?: string;
  company?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  address?: string;
  guardianName?: string;
  guardianRelation?: string;
  guardianPhone?: string;
  tshirtSize?: string;
  pickupLocation?: string;
  photo?: string;
}

interface EventInfo {
  name?: string;
}

/** Vrai si la personne née le `dob` a moins de 18 ans à la date `at`. */
function isMinorAt(dob: string, at: Date = new Date()): boolean {
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return false;
  const adultFrom = new Date(birth);
  adultFrom.setFullYear(birth.getFullYear() + 18);
  return adultFrom > at;
}

const GENDER_MAP: Record<'male' | 'female', ParticipantGender> = {
  male: ParticipantGender.MALE,
  female: ParticipantGender.FEMALE,
};

export interface PublicRegistrationResponse {
  id: string;
  registrationNumber: string;
  participant: {
    id: string;
    firstName: string;
    lastName: string;
    gender?: string;
    dob?: Date;
    email?: string;
    phone: string;
    city?: string;
    country?: string;
    church?: string;
    title?: string;
    profession?: string;
    company?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    address?: string;
    guardianName?: string;
    guardianRelation?: string;
    guardianPhone?: string;
    tshirtSize?: string;
    pickupLocation?: string;
    photo?: string;
  };
  event: {
    id: string;
    name: string;
    startDate: Date;
    endDate: Date;
    location?: string;
  };
  qrCode: string;
  status: string;
  createdAt: Date;
}

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(
    private readonly registrationsRepository: RegistrationsRepository,
    private readonly countersRepository: CountersRepository,
    private readonly participantsService: ParticipantsService,
    private readonly eventsService: EventsService,
    private readonly qrcodeService: QrcodeService,
    private readonly paymentsService: PaymentsService,
    private readonly paymentIntentsRepository: PaymentIntentsRepository,
    private readonly mailService: MailService,
    @InjectModel(Attendance.name)
    private readonly attendanceModel: Model<AttendanceDocument>,
  ) {}

  /**
   * Filtre « présent / absent à la séance du jour J » : traduit en liste
   * d'identifiants d'inscriptions pointées ce jour-là.
   */
  private async applySessionFilter(
    filter: FilterQuery<Registration>,
    query: QueryRegistrationsDto,
  ): Promise<void> {
    const date = query.presentOn ?? query.absentOn;
    if (!date || !query.event) return;
    const ids = await this.attendanceModel
      .distinct('registration', { event: query.event, date })
      .exec();
    filter._id = query.presentOn ? { $in: ids } : { $nin: ids };
  }

  /** Dates des séances où chaque inscription de la liste a été pointée. */
  private async attendanceDatesByRegistration(
    registrationIds: string[],
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (registrationIds.length === 0) return map;
    const rows = await this.attendanceModel
      .find(
        {
          registration: {
            $in: registrationIds.map((id) => new Types.ObjectId(id)),
          },
        },
        { registration: 1, date: 1 },
      )
      .sort({ date: 1 })
      .lean()
      .exec();
    for (const row of rows) {
      const key = String(row.registration);
      map.set(key, [...(map.get(key) ?? []), row.date]);
    }
    return map;
  }

  private async verifyPayment(
    paymentRef: string,
    expectedAmount?: number,
  ): Promise<void> {
    const payment = await this.paymentsService.getStatus(paymentRef);

    if (payment.status !== 'SUCCESSFUL') {
      throw new PaymentRequiredException(
        payment.status === 'FAILED'
          ? 'Le paiement a échoué ou a été annulé. Veuillez réessayer.'
          : 'Le paiement n\u2019est pas encore confirmé. Veuillez finaliser le paiement avant de réserver votre billet.',
      );
    }

    if (expectedAmount && payment.amount && payment.amount < expectedAmount) {
      throw new BadRequestException(
        'Le montant payé est insuffisant pour cet événement.',
      );
    }
  }

  async create(dto: CreateRegistrationDto): Promise<RegistrationDocument> {
    await this.participantsService.findById(dto.participantId);
    const event = await this.eventsService.findById(dto.eventId);

    const existing = await this.registrationsRepository.findByParticipantAndEvent(
      dto.participantId,
      dto.eventId,
    );
    if (existing) {
      throw new ConflictException(
        'This participant is already registered for this event',
      );
    }

    const year = new Date().getFullYear();
    const sequence = await this.countersRepository.getNextSequence(
      `registration:${year}`,
    );
    const registrationNumber = `${event.registrationPrefix ?? DEFAULT_REGISTRATION_PREFIX}-${year}-${String(
      sequence,
    ).padStart(6, '0')}`;
    const code = this.qrcodeService.generateOpaqueCode();

    return this.registrationsRepository.create({
      participant: dto.participantId,
      event: dto.eventId,
      registrationNumber,
      code,
    });
  }

  async createPublic(
    dto: PublicRegisterDto,
  ): Promise<PublicRegistrationResponse> {
    return this.completeRegistration(dto);
  }

  /**
   * Rattrapage admin : crée une inscription à partir d'une référence de
   * paiement FeexPay déjà confirmée, en ressaisissant les informations du
   * payeur. Utilisé quand le paiement a abouti côté FeexPay mais que
   * l'inscription n'a jamais été enregistrée.
   */
  async createFromPayment(
    dto: AdminRattrapageDto,
  ): Promise<PublicRegistrationResponse> {
    return this.completeRegistration(dto, { updateExistingParticipant: false });
  }

  private async completeRegistration(
    dto: {
      firstName: string;
      lastName: string;
      gender?: 'male' | 'female';
      phone: string;
      whatsapp?: string;
      email?: string;
      city?: string;
      country?: string;
      church?: string;
      title?: string;
      profession?: string;
      company?: string;
      dob?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      address?: string;
      guardianName?: string;
      guardianRelation?: string;
      guardianPhone?: string;
      acceptRules?: boolean;
      parentalConsent?: boolean;
      dataConsent?: boolean;
      tshirtSize?: string;
      pickupLocation?: string;
      eventId: string;
      paymentRef?: string;
      paymentNetwork?: string;
      paymentPhone?: string;
      paymentAmount?: number;
    },
    options?: { updateExistingParticipant?: boolean },
  ): Promise<PublicRegistrationResponse> {
    const event = await this.eventsService.findById(dto.eventId);

    if (dto.dob && isMinorAt(dto.dob, event.startDate)) {
      if (!dto.guardianName || !dto.guardianPhone || !dto.parentalConsent) {
        throw new BadRequestException(
          "Participant mineur : les coordonnées du parent ou tuteur légal et l'autorisation parentale sont obligatoires.",
        );
      }
    }

    let participant = await this.participantsService.findByEmailOrPhone(
      dto.email,
      dto.phone,
    );

    // Coordonnées partagées (ex. un payeur inscrit plusieurs personnes avec
    // son propre email/téléphone) : on ne réutilise le participant trouvé que
    // s'il s'agit de la MÊME personne, sinon on crée un dossier dédié (sans
    // quoi le 2e dossier heurte le conflit « déjà inscrit » et sa ref de
    // paiement est perdue).
    if (participant && dto.firstName && dto.lastName) {
      const sameName = (a?: string, b?: string) =>
        (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
      if (
        !sameName(participant.firstName, dto.firstName) ||
        !sameName(participant.lastName, dto.lastName)
      ) {
        participant = null;
      }
    }

    const patch: Record<string, string> = {};
    if (dto.firstName) patch.firstName = dto.firstName;
    if (dto.lastName) patch.lastName = dto.lastName;
    if (dto.gender) patch.gender = GENDER_MAP[dto.gender];
    if (dto.phone) patch.phone = dto.phone;
    if (dto.whatsapp) patch.whatsapp = dto.whatsapp;
    if (dto.email) patch.email = dto.email;
    if (dto.city) patch.city = dto.city;
    if (dto.country) patch.country = dto.country;
    if (dto.church) patch.church = dto.church;
    if (dto.title) patch.title = dto.title;
    if (dto.profession) patch.profession = dto.profession;
    if (dto.company) patch.company = dto.company;
    if (dto.dob) patch.dob = dto.dob;
    if (dto.emergencyContactName) {
      patch.emergencyContactName = dto.emergencyContactName;
    }
    if (dto.emergencyContactPhone) {
      patch.emergencyContactPhone = dto.emergencyContactPhone;
    }
    if (dto.address) patch.address = dto.address;
    if (dto.guardianName) patch.guardianName = dto.guardianName;
    if (dto.guardianRelation) patch.guardianRelation = dto.guardianRelation;
    if (dto.guardianPhone) patch.guardianPhone = dto.guardianPhone;
    const now = new Date().toISOString();
    if (dto.acceptRules) patch.rulesAcceptedAt = now;
    if (dto.parentalConsent) patch.parentalConsentAt = now;
    if (dto.dataConsent) patch.dataConsentAt = now;
    if (dto.tshirtSize) patch.tshirtSize = dto.tshirtSize;
    if (dto.pickupLocation) patch.pickupLocation = dto.pickupLocation;

    if (!participant) {
      participant = await this.participantsService.create({
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        ...patch,
      });
    } else if (
      options?.updateExistingParticipant !== false &&
      Object.keys(patch).length > 0
    ) {
      await this.participantsService.update(participant.id, patch);
    }

    let created = false;
    let registration = await this.registrationsRepository.findByParticipantAndEvent(
      participant.id,
      dto.eventId,
    );

    if (dto.paymentRef) {
      const usedPayment =
        await this.registrationsRepository.findByPaymentRefCaseInsensitive(
          dto.paymentRef,
        );
      if (usedPayment) {
        // Idempotence : la référence a déjà servi à créer un billet. On la
        // renvoie tel quel (au lieu d'un conflit) pour permettre au front ou
        // au webhook de rejouer sans dupliquer et sans perdre le QR code.
        return this.buildPublicResponseForDocument(usedPayment);
      }

      await this.verifyPayment(dto.paymentRef, dto.paymentAmount);
    }

    if (registration) {
      if (!registration.paymentRef && dto.paymentRef) {
        registration = await this.registrationsRepository.updateById(
          registration.id,
          {
            paymentRef: dto.paymentRef,
            paymentNetwork: dto.paymentNetwork,
            paymentPhone: dto.paymentPhone,
            paymentAmount: dto.paymentAmount,
            status: RegistrationStatus.CONFIRMED,
          },
        );
        if (!registration) {
          throw new NotFoundException('Registration not found');
        }
      } else if (event.isFree && !dto.paymentRef) {
        // Événement gratuit : une nouvelle soumission par la même personne
        // renvoie son billet existant (QR perdu, page rechargée...).
        return this.buildPublicResponseForDocument(registration);
      } else {
        throw new ConflictException(
          'Vous êtes déjà inscrit(e) à cet événement.',
        );
      }
    } else {
      created = true;
      const year = new Date().getFullYear();
      const sequence = await this.countersRepository.getNextSequence(
        `registration:${year}`,
      );
      const registrationNumber = `${event.registrationPrefix ?? DEFAULT_REGISTRATION_PREFIX}-${year}-${String(
        sequence,
      ).padStart(6, '0')}`;
      const code = this.qrcodeService.generateOpaqueCode();

      registration = await this.registrationsRepository.create({
        participant: participant.id,
        event: dto.eventId,
        registrationNumber,
        code,
        paymentRef: dto.paymentRef,
        paymentNetwork: dto.paymentNetwork,
        paymentPhone: dto.paymentPhone,
        paymentAmount: dto.paymentAmount,
        status:
          dto.paymentRef || event.isFree
            ? RegistrationStatus.CONFIRMED
            : RegistrationStatus.PENDING,
      });
    }

    const token = this.qrcodeService.buildToken(
      registration.id,
      registration.code,
      this.qrInfo(participant, event, registration.registrationNumber),
    );
    const qrCode = await this.qrcodeService.toImageDataUrl(token);

    const recipient = dto.email ?? participant.email;
    if (created && event.isFree && recipient) {
      // Envoi en arrière-plan : l'inscription ne dépend pas de l'e-mail.
      void this.mailService
        .sendTicket({
          to: recipient,
          firstName: participant.firstName,
          eventName: event.name,
          registrationNumber: registration.registrationNumber,
          qrCodeDataUrl: qrCode,
          eventDate: event.startDate,
          eventScheduleLabel: event.scheduleLabel,
          eventLocation: event.location,
        })
        .catch((error: unknown) =>
          this.logger.warn(
            `E-mail du billet ${registration?.registrationNumber} non envoyé : ${String(error)}`,
          ),
        );
    }

    return {
      id: registration.id,
      registrationNumber: registration.registrationNumber,
      participant: {
        id: participant.id,
        firstName: participant.firstName,
        lastName: participant.lastName,
        gender: participant.gender,
        dob: participant.dob,
        email: participant.email,
        phone: participant.phone,
        city: participant.city,
        country: participant.country,
        church: participant.church,
        title: participant.title,
        profession: participant.profession,
        company: participant.company,
        emergencyContactName: participant.emergencyContactName,
        emergencyContactPhone: participant.emergencyContactPhone,
        address: participant.address,
        guardianName: participant.guardianName,
        guardianRelation: participant.guardianRelation,
        guardianPhone: participant.guardianPhone,
        tshirtSize: participant.tshirtSize,
        pickupLocation: participant.pickupLocation,
        photo: participant.photo,
      },
      event: {
        id: event.id,
        name: event.name,
        startDate: event.startDate,
        endDate: event.endDate,
        location: event.location,
      },
      qrCode,
      status: registration.status,
      createdAt: (registration as unknown as { createdAt: Date }).createdAt,
    };
  }

  /**
   * Traite la notification de paiement FeexPay (webhook serveur-à-serveur).
   *
   * C'est la vraie solution aux inscriptions « payées mais jamais créées » :
   * le navigateur peut être fermé avant la fin du polling, alors que FeexPay
   * notifie le backend à chaque changement de statut. On ack rapidement (2xx)
   * et on crée l'inscription de façon idempotente.
   */
  async completeFromPaymentWebhook(
    payload: Record<string, unknown>,
  ): Promise<{ received: boolean; registration?: PublicRegistrationResponse }> {
    const reference = this.paymentsService.extractReferenceFromPayload(payload);
    if (!reference) {
      this.logger.warn('Webhook FeexPay sans référence, ignoré.');
      return { received: true };
    }

    const status = normalizeFeexpayStatus(payload?.status);
    if (status !== 'SUCCESSFUL') {
      this.logger.log(
        `Webhook FeexPay ${reference} : statut "${String(payload?.status)}", rien à faire.`,
      );
      return { received: true };
    }

    const already =
      await this.registrationsRepository.findByPaymentRefCaseInsensitive(
        reference,
      );
    if (already) {
      this.logger.log(`Webhook FeexPay ${reference} : déjà inscrit, rejet idempotent.`);
      return {
        received: true,
        registration: await this.buildPublicResponseForDocument(already),
      };
    }

    const info =
      payload?.callback_info &&
      typeof payload.callback_info === 'object'
        ? (payload.callback_info as Record<string, unknown>)
        : undefined;

    // Si FeexPay n'a pas renvoyé les données du formulaire, on les récupère
    // depuis l'intention de paiement sauvegardée à l'initiation.
    let intent: {
      callbackInfo?: Record<string, unknown>;
      amount?: number;
    } | null = null;
    if (!info?.eventId) {
      intent = await this.paymentIntentsRepository.findByReference(reference);
    }
    const data = (key: string): unknown =>
      info?.[key] ?? intent?.callbackInfo?.[key];

    const eventId = data('eventId');
    const firstName = data('firstName');
    const lastName = data('lastName');
    const phone = data('phone');

    if (!eventId || !firstName || !lastName || !phone) {
      this.logger.warn(
        `Webhook FeexPay ${reference} : données d'inscription incomplètes, ignoré.`,
      );
      return { received: true };
    }

    try {
      const registration = await this.completeRegistration({
        firstName: String(firstName),
        lastName: String(lastName),
        phone: String(phone),
        email: data('email')
          ? String(data('email'))
          : undefined,
        city: data('city') ? String(data('city')) : undefined,
        country: data('country') ? String(data('country')) : undefined,
        church: data('church') ? String(data('church')) : undefined,
        tshirtSize: data('tshirtSize')
          ? String(data('tshirtSize'))
          : undefined,
        pickupLocation: data('pickupLocation')
          ? String(data('pickupLocation'))
          : undefined,
        eventId: String(eventId),
        paymentRef: reference,
        paymentNetwork: data('paymentNetwork')
          ? String(data('paymentNetwork'))
          : undefined,
        paymentPhone: data('paymentPhone')
          ? String(data('paymentPhone'))
          : undefined,
        paymentAmount:
          typeof payload?.amount === 'number'
            ? payload.amount
            : typeof intent?.amount === 'number'
              ? intent.amount
              : undefined,
      });

      this.logger.log(
        `Webhook FeexPay ${reference} : inscription ${registration.registrationNumber} créée.`,
      );
      return { received: true, registration };
    } catch (err) {
      this.logger.error(
        `Webhook FeexPay ${reference} : échec de l'inscription`,
        err instanceof Error ? err.stack : err,
      );
      throw err;
    }
  }

  private async buildPublicResponseForDocument(
    registration: RegistrationDocument,
  ): Promise<PublicRegistrationResponse> {
    await registration.populate('participant');
    await registration.populate('event');
    const participant = registration.participant as unknown as ParticipantInfo & {
      id?: string;
    };
    const event = registration.event as unknown as {
      id?: string;
      name?: string;
      startDate?: Date;
      endDate?: Date;
      location?: string;
    };
    return {
      id: registration.id,
      registrationNumber: registration.registrationNumber,
      participant: {
        id: participant.id ?? String((registration as { participant?: unknown }).participant),
        firstName: participant.firstName ?? '',
        lastName: participant.lastName ?? '',
        gender: participant.gender,
        dob: participant.dob,
        email: participant.email,
        phone: participant.phone ?? '',
        city: participant.city,
        country: participant.country,
        church: participant.church,
        title: participant.title,
        profession: participant.profession,
        company: participant.company,
        emergencyContactName: participant.emergencyContactName,
        emergencyContactPhone: participant.emergencyContactPhone,
        address: participant.address,
        guardianName: participant.guardianName,
        guardianRelation: participant.guardianRelation,
        guardianPhone: participant.guardianPhone,
        tshirtSize: participant.tshirtSize,
        pickupLocation: participant.pickupLocation,
        photo: participant.photo,
      },
      event: {
        id: event.id ?? '',
        name: event.name ?? '',
        startDate: event.startDate ?? new Date(),
        endDate: event.endDate ?? new Date(),
        location: event.location,
      },
      qrCode: await this.qrcodeService.toImageDataUrl(
        this.qrcodeService.buildToken(
          registration.id,
          registration.code,
          this.qrInfo(participant, event, registration.registrationNumber),
        ),
      ),
      status: registration.status,
      createdAt: (registration as unknown as { createdAt: Date }).createdAt,
    };
  }

  async findAll(
    query: QueryRegistrationsDto,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const filter: FilterQuery<Registration> = {};
    if (query.event) {
      filter.event = query.event;
    }
    if (query.paid === 'true') {
      filter.paymentRef = { $exists: true, $ne: null };
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.paymentNetwork) {
      filter.paymentNetwork = query.paymentNetwork;
    }
    await this.applySessionFilter(filter, query);

    const participantFilter: FilterQuery<Record<string, unknown>> = {};
    if (query.tshirtSize) {
      participantFilter.tshirtSize = query.tshirtSize;
    }
    if (query.pickupLocation) {
      participantFilter.pickupLocation = query.pickupLocation;
    }
    if (query.city) {
      participantFilter.city = query.city;
    }
    if (query.church) {
      participantFilter.church = query.church;
    }
    if (query.country) {
      participantFilter.country = query.country;
    }
    if (query.gender) {
      participantFilter.gender = query.gender;
    }
    if (query.title) {
      participantFilter.title = query.title;
    }
    if (query.profession) {
      participantFilter.profession = query.profession;
    }
    if (query.search) {
      const search = query.search.trim();
      if (search) {
        participantFilter.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ];
      }
    }

    const result = Object.keys(participantFilter).length
      ? await this.registrationsRepository.findFiltered(
          filter,
          participantFilter,
          query,
        )
      : await this.registrationsRepository.findAll(filter, query);

    const items = await Promise.all(
      result.items.map(async (registration) => {
        if ('participantDoc' in registration) {
          const r = registration as Record<string, unknown> & {
            _id: unknown;
            participantDoc?: Record<string, unknown>;
            eventDoc?: { name?: string };
          };
          const participant = (r.participantDoc ?? {}) as {
            firstName?: string;
            lastName?: string;
            email?: string;
            phone?: string;
            city?: string;
            country?: string;
            church?: string;
            tshirtSize?: string;
            pickupLocation?: string;
          };
          const event = (r.eventDoc ?? {}) as { name?: string; isFree?: boolean };
          const token = this.qrcodeService.buildToken(
            String(r._id),
            String(r.code),
            this.qrInfo(participant, event, String(r.registrationNumber)),
          );
          const qrCode = await this.qrcodeService.toImageDataUrl(token);
          const { participantDoc: _pd, eventDoc: _ed, ...rest } = r;
          void _pd;
          void _ed;
          return { ...rest, participant, id: String(r._id), qrCode };
        }
        const reg = registration as unknown as RegistrationDocument;
        await reg.populate('participant');
        await reg.populate('event');
        const participant = reg.participant as unknown as {
          firstName?: string;
          lastName?: string;
          email?: string;
          phone?: string;
          city?: string;
          country?: string;
          church?: string;
          tshirtSize?: string;
          pickupLocation?: string;
        };
        const event = reg.event as unknown as { name?: string; isFree?: boolean };
        const token = this.qrcodeService.buildToken(
          reg.id,
          reg.code,
          this.qrInfo(participant, event, reg.registrationNumber),
        );
        const qrCode = await this.qrcodeService.toImageDataUrl(token);
        return {
          ...reg.toObject(),
          id: reg.id,
          qrCode,
        };
      }),
    );

    const datesByRegistration = await this.attendanceDatesByRegistration(
      items.map((item) => String(item.id)),
    );
    for (const item of items as Record<string, unknown>[]) {
      item.attendanceDates = datesByRegistration.get(String(item.id)) ?? [];
    }

    return { items, meta: result.meta };
  }

  async getStats(query: QueryRegistrationsDto): Promise<{
    total: number;
    byTshirtSize: { value: string; count: number }[];
    byPickupLocation: { value: string; count: number }[];
    byCity: { value: string; count: number }[];
    byChurch: { value: string; count: number }[];
    byPaymentNetwork: { value: string; count: number }[];
    byStatus: { value: string; count: number }[];
    byCountry: { value: string; count: number }[];
    byGender: { value: string; count: number }[];
    byTitle: { value: string; count: number }[];
    byProfession: { value: string; count: number }[];
    bySession: { value: string; count: number }[];
  }> {
    const filter: FilterQuery<Registration> = {};
    if (query.event) {
      filter.event = query.event;
    }
    if (query.paid === 'true') {
      filter.paymentRef = { $exists: true, $ne: null };
    }
    const [stats, sessions] = await Promise.all([
      this.registrationsRepository.aggregateStats(filter),
      query.event
        ? this.attendanceModel
            .aggregate<{ _id: string; count: number }>([
              { $match: { event: new Types.ObjectId(query.event) } },
              { $group: { _id: '$date', count: { $sum: 1 } } },
              { $sort: { _id: 1 } },
            ])
            .exec()
        : Promise.resolve([]),
    ]);
    return {
      ...stats,
      bySession: sessions.map((s) => ({ value: s._id, count: s.count })),
    };
  }

  async exportPdf(query: QueryRegistrationsDto): Promise<Buffer> {
    const filter: FilterQuery<Registration> = {};
    if (query.event) filter.event = query.event;
    if (query.paid === 'true') {
      filter.paymentRef = { $exists: true, $ne: null };
    }

    const result = await this.registrationsRepository.findAll(filter, {
      page: 1,
      limit: 1000,
      sortBy: query.sortBy ?? 'createdAt',
      sortOrder: query.sortOrder ?? 'asc',
    });

    const rows: RegistrationsPdfRow[] = await Promise.all(
      result.items.map(async (registration, index) => {
        await registration.populate('participant');
        await registration.populate('event');
        const participant = (registration.participant ??
          {}) as ParticipantInfo;
        const event = (registration.event ?? {}) as EventInfo;
        const fullName = [participant.firstName, participant.lastName]
          .filter(Boolean)
          .join(' ')
          .trim();
        const network = registration.paymentNetwork
          ? PAYMENT_NETWORK_LABELS[registration.paymentNetwork] ??
            registration.paymentNetwork
          : '';
        const amount =
          registration.paymentAmount != null
            ? `${registration.paymentAmount
                .toLocaleString('fr-FR')
                .replace(/\u202f/g, ' ')} FCFA`
            : '';
        return {
          index: index + 1,
          registrationNumber: registration.registrationNumber,
          fullName,
          phone: participant.phone ?? '',
          email: participant.email ?? '',
          tshirtSize: participant.tshirtSize ?? '',
          pickupLocation: participant.pickupLocation ?? '',
          network,
          amount,
        };
      }),
    );

    return buildRegistrationsPdfBuffer({
      eventName: result.items[0]
        ? ((result.items[0].event ?? {}) as EventInfo).name
        : undefined,
      generatedAt: new Date(),
      rows,
    });
  }

  async findById(id: string): Promise<RegistrationDocument> {
    const registration = await this.registrationsRepository.findById(id);
    if (!registration) {
      throw new NotFoundException('Registration not found');
    }
    return registration;
  }

  async getQrCode(
    id: string,
  ): Promise<{ registrationNumber: string; qrCode: string }> {
    const registration = await this.findById(id);
    await registration.populate('participant');
    await registration.populate('event');
    const participant = registration.participant as unknown as {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      city?: string;
      country?: string;
      church?: string;
      tshirtSize?: string;
      pickupLocation?: string;
    };
    const event = registration.event as unknown as { name?: string; isFree?: boolean };
    const token = this.qrcodeService.buildToken(
      registration.id,
      registration.code,
      this.qrInfo(participant, event, registration.registrationNumber),
    );
    const qrCode = await this.qrcodeService.toImageDataUrl(token);
    return { registrationNumber: registration.registrationNumber, qrCode };
  }

  /**
   * Extrait les informations de la personne embarquées dans le QR code.
   */
  private qrInfo(
    participant: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      city?: string;
      country?: string;
      church?: string;
      tshirtSize?: string;
      pickupLocation?: string;
    },
    event: { name?: string; isFree?: boolean },
    registrationNumber?: string,
  ): Record<string, unknown> {
    const eventName = event.name;
    const fullName =
      [participant.firstName, participant.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() || undefined;
    // Événements gratuits (camp de mineurs, séminaire...) : le QR code ne
    // contient aucune donnée personnelle lisible, seulement le billet.
    if (event.isFree) {
      return { registrationNumber, eventName, fullName };
    }
    return {
      registrationNumber,
      eventName,
      firstName: participant.firstName,
      lastName: participant.lastName,
      fullName,
      email: participant.email,
      phone: participant.phone,
      city: participant.city,
      country: participant.country,
      church: participant.church,
      tshirtSize: participant.tshirtSize,
      pickupLocation: participant.pickupLocation,
    };
  }

  async updateStatus(
    id: string,
    dto: UpdateRegistrationStatusDto,
  ): Promise<RegistrationDocument> {
    const registration = await this.registrationsRepository.updateById(id, dto);
    if (!registration) {
      throw new NotFoundException('Registration not found');
    }
    return registration;
  }

  async remove(id: string): Promise<void> {
    const registration = await this.registrationsRepository.deleteById(id);
    if (!registration) {
      throw new NotFoundException('Registration not found');
    }
  }
}
