import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FilterQuery } from 'mongoose';
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
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
  church?: string;
  tshirtSize?: string;
  pickupLocation?: string;
  photo?: string;
}

interface EventInfo {
  name?: string;
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
    email?: string;
    phone: string;
    city?: string;
    country?: string;
    church?: string;
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
  ) {}

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
          },
        );
        if (!registration) {
          throw new NotFoundException('Registration not found');
        }
      } else {
        throw new ConflictException(
          'Vous êtes déjà inscrit(e) à cet événement.',
        );
      }
    } else {
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
      });
    }

    const token = this.qrcodeService.buildToken(
      registration.id,
      registration.code,
      this.qrInfo(participant, event.name, registration.registrationNumber),
    );
    const qrCode = await this.qrcodeService.toImageDataUrl(token);

    return {
      id: registration.id,
      registrationNumber: registration.registrationNumber,
      participant: {
        id: participant.id,
        firstName: participant.firstName,
        lastName: participant.lastName,
        email: participant.email,
        phone: participant.phone,
        city: participant.city,
        country: participant.country,
        church: participant.church,
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
        email: participant.email,
        phone: participant.phone ?? '',
        city: participant.city,
        country: participant.country,
        church: participant.church,
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
          this.qrInfo(participant, event.name, registration.registrationNumber),
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

    const result = await this.registrationsRepository.findAll(filter, query);

    const items = await Promise.all(
      result.items.map(async (registration) => {
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
        const event = registration.event as unknown as { name?: string };
        const token = this.qrcodeService.buildToken(
          registration.id,
          registration.code,
          this.qrInfo(participant, event.name, registration.registrationNumber),
        );
        const qrCode = await this.qrcodeService.toImageDataUrl(token);
        return {
          ...registration.toObject(),
          id: registration.id,
          qrCode,
        };
      }),
    );

    return { items, meta: result.meta };
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
    const event = registration.event as unknown as { name?: string };
    const token = this.qrcodeService.buildToken(
      registration.id,
      registration.code,
      this.qrInfo(participant, event.name, registration.registrationNumber),
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
    eventName?: string,
    registrationNumber?: string,
  ): Record<string, unknown> {
    return {
      registrationNumber,
      eventName,
      firstName: participant.firstName,
      lastName: participant.lastName,
      fullName: [participant.firstName, participant.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() || undefined,
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
