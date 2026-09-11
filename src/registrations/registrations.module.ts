import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventsModule } from 'src/events/events.module';
import { ParticipantsModule } from 'src/participants/participants.module';
import { QrcodeModule } from 'src/qrcode/qrcode.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { Counter, CounterSchema } from './schemas/counter.schema';
import { Registration, RegistrationSchema } from './schemas/registration.schema';
import { CountersRepository } from './repositories/counters.repository';
import { RegistrationsRepository } from './repositories/registrations.repository';
import { RegistrationsService } from './registrations.service';
import { RegistrationsController } from './registrations.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Registration.name, schema: RegistrationSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
    ParticipantsModule,
    EventsModule,
    QrcodeModule,
    PaymentsModule,
  ],
  controllers: [RegistrationsController],
  providers: [RegistrationsRepository, CountersRepository, RegistrationsService],
  exports: [RegistrationsService, RegistrationsRepository],
})
export class RegistrationsModule {}
