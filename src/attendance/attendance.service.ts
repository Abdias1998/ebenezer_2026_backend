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
 * Résultat d'un contrôle de billet, pensé pour l'écran du scanner :
 * - `checked-in` : billet valide, l'entrée vient d'être enregistrée ;
 * - `already-checked-in` : billet déjà scanné (heure + agent du 1er scan) ;
 * - `valid` : billet valide, pas encore scanné (vérification sans pointage).
 * Un billet invalide (falsifié, annulé, non payé, autre événement) lève une
 * erreur 4xx avec un message lisible.
 */
export type CheckInOutcome = 'checked-in' | 'already-checked-in' | 'valid';

export interface CheckInResult {
  outcome: CheckInOutcome;
  alreadyCheckedIn: boolean;
  /** Heure du (premier) pointage ; absente si le billet n'a jamais été scanné. */
  checkedInAt?: Date;
  /** Agent qui a effectué le premier pointage. */
  checkedInBy?: string;
  registration: {
    id: string;
    registrationNumber: string;
    status: RegistrationStatus;
    paymentAmount?: number;
    paymentNetwork?: string;
    createdAt?: Date;
  };
  participant: {
    firstName?: string;
    lastName?: string;
    gender?: string;
    email?: string;
    phone?: string;
    city?: string;
    country?: string;
    church?: string;
    title?: string;
    profession?: string;
    company?: string;
    pickupLocation?: string;
    tshirtSize?: string;
  };
  event: { id: string; name?: string; singleCheckIn: boolean };
}

interface PopulatedEvent {
  id: string;
  name?: string;
  singleCheckIn?: boolean;
}

interface PopulatedUser {
  firstName?: string;
  lastName?: string;
  email?: string;
}

type PopulatedParticipant = CheckInResult['participant'] & { id: string };

@Injectable()
export class AttendanceService {
  constructor(
    private readonly attendanceRepository: AttendanceRepository,
    private readonly registrationsRepository: RegistrationsRepository,
    private readonly qrcodeService: QrcodeService,
  ) {}

  /** Scan à l'entrée : vérifie le billet et enregistre l'arrivée. */
  async scan(dto: ScanDto, scannedByUserId: string): Promise<CheckInResult> {
    const registration = await this.registrationFromQr(dto.qrContent);
    return this.checkIn(registration, scannedByUserId, dto.eventId);
  }

  /** Vérifie un billet sans l'enregistrer (contrôle, page /admin/verifier). */
  async verify(dto: ScanDto): Promise<CheckInResult> {
    const registration = await this.registrationFromQr(dto.qrContent);
    const { event, participant } = await this.validate(
      registration,
      dto.eventId,
    );
    const previous = await this.previousCheckIn(registration, event);
    if (previous) {
      return this.build(registration, event, participant, {
        outcome: 'already-checked-in',
        ...previous,
      });
    }
    return this.build(registration, event, participant, { outcome: 'valid' });
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

  private async registrationFromQr(
    qrContent: string,
  ): Promise<RegistrationDocument> {
    const { registrationId, code } = this.qrcodeService.verify(qrContent);
    const registration = await this.registrationsRepository.findById(
      registrationId,
    );
    if (!registration) {
      throw new NotFoundException(
        'Billet inconnu : aucune inscription ne correspond à ce QR code.',
      );
    }
    if (registration.code !== code) {
      throw new BadRequestException('QR code invalide ou falsifié.');
    }
    return registration;
  }

  /** Refuse un billet annulé, non payé ou d'un autre événement. */
  private async validate(
    registration: RegistrationDocument,
    expectedEventId?: string,
  ): Promise<{ event: PopulatedEvent; participant: PopulatedParticipant }> {
    await registration.populate('event');
    await registration.populate('participant');
    const event = registration.event as unknown as PopulatedEvent;
    const participant =
      registration.participant as unknown as PopulatedParticipant;

    if (expectedEventId && event.id !== expectedEventId) {
      throw new BadRequestException(
        `Ce billet n'est pas valable pour cet événement (billet « ${event.name ?? 'autre événement'} »).`,
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
    return { event, participant };
  }

  /** Premier pointage déjà enregistré (sur l'événement ou la séance du jour). */
  private async previousCheckIn(
    registration: RegistrationDocument,
    event: PopulatedEvent,
  ): Promise<{ checkedInAt: Date; checkedInBy?: string } | null> {
    const attendance = event.singleCheckIn
      ? await this.attendanceRepository.findOne({
          registration: registration.id,
        })
      : await this.attendanceRepository.findOne({
          registration: registration.id,
          date: todayString(),
        });

    if (!attendance) {
      if (event.singleCheckIn && registration.checkedInAt) {
        return { checkedInAt: registration.checkedInAt };
      }
      return null;
    }

    await attendance.populate('scannedBy', 'firstName lastName email');
    const agent = attendance.scannedBy as unknown as PopulatedUser | null;
    const agentName =
      [agent?.firstName, agent?.lastName].filter(Boolean).join(' ').trim() ||
      agent?.email;
    return {
      checkedInAt:
        event.singleCheckIn && registration.checkedInAt
          ? registration.checkedInAt
          : attendance.scannedAt,
      checkedInBy: agentName || undefined,
    };
  }

  private build(
    registration: RegistrationDocument,
    event: PopulatedEvent,
    participant: PopulatedParticipant,
    state: {
      outcome: CheckInOutcome;
      checkedInAt?: Date;
      checkedInBy?: string;
    },
  ): CheckInResult {
    const checkedIn = state.outcome !== 'valid';
    return {
      outcome: state.outcome,
      alreadyCheckedIn: state.outcome === 'already-checked-in',
      checkedInAt: state.checkedInAt,
      checkedInBy: state.checkedInBy,
      registration: {
        id: registration.id,
        registrationNumber: registration.registrationNumber,
        status: checkedIn ? RegistrationStatus.CHECKED_IN : registration.status,
        paymentAmount: registration.paymentAmount,
        paymentNetwork: registration.paymentNetwork,
        createdAt: (registration as unknown as { createdAt?: Date }).createdAt,
      },
      participant: {
        firstName: participant.firstName,
        lastName: participant.lastName,
        gender: participant.gender,
        email: participant.email,
        phone: participant.phone,
        city: participant.city,
        country: participant.country,
        church: participant.church,
        title: participant.title,
        profession: participant.profession,
        company: participant.company,
        pickupLocation: participant.pickupLocation,
        tshirtSize: participant.tshirtSize,
      },
      event: {
        id: event.id,
        name: event.name,
        singleCheckIn: !!event.singleCheckIn,
      },
    };
  }

  private async checkIn(
    registration: RegistrationDocument,
    scannedByUserId: string,
    expectedEventId?: string,
  ): Promise<CheckInResult> {
    const { event, participant } = await this.validate(
      registration,
      expectedEventId,
    );

    if (event.singleCheckIn && registration.checkedInAt) {
      const previous = await this.previousCheckIn(registration, event);
      return this.build(registration, event, participant, {
        outcome: 'already-checked-in',
        checkedInAt: previous?.checkedInAt ?? registration.checkedInAt,
        checkedInBy: previous?.checkedInBy,
      });
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
        // Deux scans simultanés, ou déjà pointé aujourd'hui.
        const previous = await this.previousCheckIn(registration, event);
        return this.build(registration, event, participant, {
          outcome: 'already-checked-in',
          checkedInAt: previous?.checkedInAt ?? registration.checkedInAt ?? now,
          checkedInBy: previous?.checkedInBy,
        });
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

    return this.build(registration, event, participant, {
      outcome: 'checked-in',
      checkedInAt: now,
    });
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
