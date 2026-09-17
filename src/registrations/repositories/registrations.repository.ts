import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/repositories/base.repository';
import { Registration, RegistrationDocument } from '../schemas/registration.schema';

@Injectable()
export class RegistrationsRepository extends BaseRepository<RegistrationDocument> {
  constructor(
    @InjectModel(Registration.name) model: Model<RegistrationDocument>,
  ) {
    super(model);
  }

  async findByParticipantAndEvent(
    participantId: string,
    eventId: string,
  ): Promise<RegistrationDocument | null> {
    return this.findOne({ participant: participantId, event: eventId });
  }

  async findByCode(code: string): Promise<RegistrationDocument | null> {
    return this.findOne({ code });
  }

  async findByPaymentRef(
    paymentRef: string,
  ): Promise<RegistrationDocument | null> {
    return this.findOne({ paymentRef });
  }
}
