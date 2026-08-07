import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/repositories/base.repository';
import { Event, EventDocument, EventStatus } from '../schemas/event.schema';

@Injectable()
export class EventsRepository extends BaseRepository<EventDocument> {
  constructor(@InjectModel(Event.name) model: Model<EventDocument>) {
    super(model);
  }

  async findActive(): Promise<EventDocument | null> {
    return this.model
      .findOne({
        status: { $in: [EventStatus.PUBLISHED, EventStatus.ONGOING] },
      })
      .sort({ startDate: 1 })
      .exec();
  }
}
