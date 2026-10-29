import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { PaginatedResult } from 'src/common/interfaces/paginated-result.interface';
import { QrcodeService } from 'src/qrcode/qrcode.service';
import {
  RegistrationDocument,
  RegistrationStatus,
} from 'src/registrations/schemas/registration.schema';
import { RegistrationsRepository } from 'src/registrations/repositories/registrations.repository';
import { ScanDto } from './dto/scan.dto';
import { AttendanceRepository } from './repositories/attendance.repository';
import { AttendanceDocument } from './schemas/attendance.schema';

/**
 * Date de la séance (AAAA-MM-JJ). La journée est comptée de 05h00 à 05h00,
 * heure du Bénin (UTC+1) : un scan à 01h00 dans la nuit de vendredi à samedi
 * reste rattaché à la séance du vendredi.
 */
const SESSION_DAY_SHIFT_MS = 5 * 60 * 60 * 1000;

function todayString(): string {
  return new Date(Date.now() - SESSION_DAY_SHIFT_MS).toISOString().slice(0, 10);
}

/**
 * Résultat d'un pointage, pensé pour l'écran du scanner : on affiche qui
 * vient d'être pointé, et si la personne l'avait déjà été (et à quelle heure).
 */
export interface CheckInResult {
  alreadyCheckedIn: boolean;
  checkedInAt: Date;
  registration: {
    id: string;
    registrationNumber: string;
    status: RegistrationStatus;
  };
  participant: {
    firstName?: string;
    lastName?: string;
    gender?: string;
    phone?: string;
    city?: string;
    country?: string;
    church?: string;
    title?: string;
    profession?: string;
    company?: string;
  };
  event: { id: string; name?: string };
}

interface PopulatedEvent {
  id: string;
  name?: string;
  singleCheckIn?: boolean;
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly attendanceRepository: AttendanceRepository,
    private readonly registrationsRepository: RegistrationsRepository,
    private readonly qrcodeService: QrcodeService,
  ) {}

  async scan(dto: ScanDto, scannedByUserId: string): Promise<CheckInResult> {
    const { registrationId, code } = this.qrcodeService.verify(dto.qrContent);

    const registration = await this.registrationsRepository.findById(
      registrationId,
    );
    if (!registration) {
      throw new NotFoundException('Inscription introuvable pour ce QR code.');
    }
    if (registration.code !== code) {
      throw new BadRequestException('QR code invalide ou falsifié.');
    }

    return this.checkIn(registration, scannedByUserId, dto.eventId);
  }

  /**
   * Pointage manuel depuis le dashboard (QR code perdu, téléphone déchargé…).
   */
  async checkInById(
    registrationId: string,
    scannedByUserId: string,
    eventId?: string,
  ): Promise<CheckInResult> {
    const registration = await this.registrationsRepository.findById(
      registrationId,
    );
    if (!registration) {
      throw new NotFoundException('Inscription introuvable.');
    }
    return this.checkIn(registration, scannedByUserId, eventId);
  }

  private async checkIn(
    registration: RegistrationDocument,
    scannedByUserId: string,
    expectedEventId?: string,
  ): Promise<CheckInResult> {
    await registration.populate('event');
    await registration.populate('participant');
    const event = registration.event as unknown as PopulatedEvent;
    const participant =
      registration.participant as unknown as CheckInResult['participant'] & {
        id: string;
      };

    if (expectedEventId && event.id !== expectedEventId) {
      throw new BadRequestException(
        `Ce QR code n'est pas valable pour cet événement (billet « ${event.name ?? 'autre événement'} »).`,
      );
    }
    if (registration.status === RegistrationStatus.CANCELLED) {
      throw new BadRequestException('Cette inscription a été annulée.');
    }
    if (registration.status === RegistrationStatus.PENDING) {
      throw new BadRequestException(
        "Cette inscription n'est pas confirmée (paiement non validé).",
      );
    }

    const build = (alreadyCheckedIn: boolean, at: Date): CheckInResult => ({
      alreadyCheckedIn,
      checkedInAt: at,
      registration: {
        id: registration.id,
        registrationNumber: registration.registrationNumber,
        status: RegistrationStatus.CHECKED_IN,
      },
      participant: {
        firstName: participant.firstName,
        lastName: participant.lastName,
        gender: participant.gender,
        phone: participant.phone,
        city: participant.city,
        country: participant.country,
        church: participant.church,
        title: participant.title,
        profession: participant.profession,
        company: participant.company,
      },
      event: { id: event.id, name: event.name },
    });

    if (event.singleCheckIn && registration.checkedInAt) {
      return build(true, registration.checkedInAt);
    }

    const now = new Date();
    const date = todayString();
    try {
      await this.attendanceRepository.create({
        registration: registration.id,
        participant: participant.id,
        event: event.id,
        scannedAt: now,
        scannedBy: scannedByUserId,
        date,
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const existing = await this.attendanceRepository.findOne({
          registration: registration.id,
          date,
        });
        return build(true, existing?.scannedAt ?? registration.checkedInAt ?? now);
      }
      throw error;
    }

    if (
      registration.status !== RegistrationStatus.CHECKED_IN ||
      !registration.checkedInAt
    ) {
      await this.registrationsRepository.updateById(registration.id, {
        status: RegistrationStatus.CHECKED_IN,
        checkedInAt: registration.checkedInAt ?? now,
      });
    }

    return build(false, now);
  }

  findByParticipant(
    participantId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<AttendanceDocument>> {
    return this.attendanceRepository.findAll({ participant: participantId }, {
      ...query,
      sortBy: query.sortBy ?? 'scannedAt',
    });
  }

  findByEventAndDay(
    eventId: string,
    date: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<AttendanceDocument>> {
    return this.attendanceRepository.findAll(
      { event: eventId, date },
      { ...query, sortBy: query.sortBy ?? 'scannedAt' },
    );
  }
}
