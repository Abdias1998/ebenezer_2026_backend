import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventsService } from 'src/events/events.service';
import { ParticipantsService } from 'src/participants/participants.service';
import { ParticipantGender } from 'src/participants/schemas/participant.schema';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { PaginatedResult } from 'src/common/interfaces/paginated-result.interface';
import { QrcodeService } from 'src/qrcode/qrcode.service';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { PublicRegisterDto } from './dto/public-register.dto';
import { UpdateRegistrationStatusDto } from './dto/update-registration-status.dto';
import { CountersRepository } from './repositories/counters.repository';
import { RegistrationsRepository } from './repositories/registrations.repository';
import { RegistrationDocument } from './schemas/registration.schema';

const DEFAULT_REGISTRATION_PREFIX = 'EBEN';

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
  ) {}

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
    });

    const token = this.qrcodeService.buildToken(
      registration.id,
      registration.code,
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

  findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<RegistrationDocument>> {
    return this.registrationsRepository.findAll({}, query);
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
    const token = this.qrcodeService.buildToken(
      registration.id,
      registration.code,
    );
    const qrCode = await this.qrcodeService.toImageDataUrl(token);
    return { registrationNumber: registration.registrationNumber, qrCode };
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
