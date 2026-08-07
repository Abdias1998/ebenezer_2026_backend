import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { BaseRepository } from 'src/common/repositories/base.repository';
import { Participant, ParticipantDocument } from '../schemas/participant.schema';

@Injectable()
export class ParticipantsRepository extends BaseRepository<ParticipantDocument> {
  constructor(
    @InjectModel(Participant.name) model: Model<ParticipantDocument>,
  ) {
    super(model);
  }

  protected override notDeletedFilter(): FilterQuery<ParticipantDocument> {
    return { deletedAt: null };
  }

  async softDeleteById(id: string): Promise<ParticipantDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id, ...this.notDeletedFilter() },
        { deletedAt: new Date() },
        { new: true },
      )
      .exec();
  }

  async pushHistoryEntry(
    id: string,
    entry: { action: string; by?: string; note?: string },
  ): Promise<void> {
    await this.model
      .updateOne(
        { _id: id },
        {
          $push: {
            history: { ...entry, at: new Date() },
          },
        },
      )
      .exec();
  }
}
