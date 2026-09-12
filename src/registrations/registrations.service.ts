import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FilterQuery } from 'mongoose';
import { EventsService } from 'src/events/events.service';
import { ParticipantsService } from 'src/participants/participants.service';
import { PaymentRequiredException } from 'src/payments/exceptions/payment-required.exception';
import { PaymentsService } from 'src/payments/payments.service';
import { ParticipantGender } from 'src/participants/schemas/participant.schema';
import { PaginatedResult } from 'src/common/interfaces/paginated-result.interface';
import { QrcodeService } from 'src/qrcode/qrcode.service';
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
  constructor(
    private readonly registrationsRepository: RegistrationsRepository,
    private readonly countersRepository: CountersRepository,
    private readonly participantsService: ParticipantsService,
    private readonly eventsService: EventsService,
    private readonly qrcodeService: QrcodeService,
    private readonly paymentsService: PaymentsService,
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
    const event = await this.eventsService.findById(dto.eventId);

    let participant = await this.participantsService.findByEmailOrPhone(
      dto.email,
      dto.phone,
    );

    const participantData = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      gender: dto.gender ? GENDER_MAP[dto.gender] : undefined,
      phone: dto.phone,
      whatsapp: dto.whatsapp,
      email: dto.email,
      city: dto.city,
      country: dto.country,
      church: dto.church,
      tshirtSize: dto.tshirtSize,
      pickupLocation: dto.pickupLocation,
    };

    if (!participant) {
      participant = await this.participantsService.create(participantData);
    } else {
      await this.participantsService.update(participant.id, participantData);
    }

    const existing = await this.registrationsRepository.findByParticipantAndEvent(
      participant.id,
      dto.eventId,
    );
    if (existing) {
      throw new ConflictException(
        'Vous êtes déjà inscrit(e) à cet événement.',
      );
    }

    if (dto.paymentRef) {
      await this.verifyPayment(dto.paymentRef, dto.paymentAmount);
    }

    const year = new Date().getFullYear();
    const sequence = await this.countersRepository.getNextSequence(
      `registration:${year}`,
    );
    const registrationNumber = `${event.registrationPrefix ?? DEFAULT_REGISTRATION_PREFIX}-${year}-${String(
      sequence,
    ).padStart(6, '0')}`;
    const code = this.qrcodeService.generateOpaqueCode();

    const registration = await this.registrationsRepository.create({
      participant: participant.id,
      event: dto.eventId,
      registrationNumber,
      code,
      paymentRef: dto.paymentRef,
      paymentNetwork: dto.paymentNetwork,
      paymentPhone: dto.paymentPhone,
      paymentAmount: dto.paymentAmount,
    });

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
