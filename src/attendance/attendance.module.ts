import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QrcodeModule } from 'src/qrcode/qrcode.module';
import { RegistrationsModule } from 'src/registrations/registrations.module';
import { Attendance, AttendanceSchema } from './schemas/attendance.schema';
import { AttendanceRepository } from './repositories/attendance.repository';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { ResetWorshipBoardingTask } from './reset-worship-boarding.task';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Attendance.name, schema: AttendanceSchema },
    ]),
    RegistrationsModule,
    QrcodeModule,
  ],
  controllers: [AttendanceController],
  providers: [
    AttendanceRepository,
    AttendanceService,
    // Tâche ponctuelle : à retirer après déploiement.
    ResetWorshipBoardingTask,
  ],
  exports: [AttendanceService, AttendanceRepository],
})
export class AttendanceModule {}
