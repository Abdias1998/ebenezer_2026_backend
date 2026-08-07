import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { PaginatedResult } from 'src/common/interfaces/paginated-result.interface';
import { QrcodeService } from 'src/qrcode/qrcode.service';
import {
  RegistrationStatus,
} from 'src/registrations/schemas/registration.schema';
import { RegistrationsRepository } from 'src/registrations/repositories/registrations.repository';
import { ScanDto } from './dto/scan.dto';
import { AttendanceRepository } from './repositories/attendance.repository';
import { AttendanceDocument } from './schemas/attendance.schema';

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly attendanceRepository: AttendanceRepository,
    private readonly registrationsRepository: RegistrationsRepository,
    private readonly qrcodeService: QrcodeService,
  ) {}

  async scan(dto: ScanDto, scannedByUserId: string): Promise<AttendanceDocument> {
    const { registrationId, code } = this.qrcodeService.verify(dto.qrContent);

    const registration = await this.registrationsRepository.findById(
      registrationId,
    );
    if (!registration) {
      throw new NotFoundException('Registration not found for this QR code');
    }
    if (registration.code !== code) {
      throw new BadRequestException('Invalid or tampered QR code');
    }

    const date = todayString();

    let attendance: AttendanceDocument;
    try {
      attendance = await this.attendanceRepository.create({
        registration: registration.id,
        participant: registration.participant,
        event: registration.event,
        scannedAt: new Date(),
        scannedBy: scannedByUserId,
        date,
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new ConflictException(
          'Attendance already recorded for this participant today',
        );
      }
      throw error;
    }

    if (registration.status !== RegistrationStatus.CHECKED_IN) {
      await this.registrationsRepository.updateById(registration.id, {
        status: RegistrationStatus.CHECKED_IN,
      });
    }

    return attendance;
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
