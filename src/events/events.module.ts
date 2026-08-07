import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Registration,
  RegistrationSchema,
} from 'src/registrations/schemas/registration.schema';
import { Event, EventSchema } from './schemas/event.schema';
import { EventsRepository } from './repositories/events.repository';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Event.name, schema: EventSchema },
      { name: Registration.name, schema: RegistrationSchema },
    ]),
  ],
  controllers: [EventsController],
  providers: [EventsRepository, EventsService],
  exports: [EventsService, EventsRepository],
})
export class EventsModule {}
