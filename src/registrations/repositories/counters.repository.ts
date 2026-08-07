import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Counter, CounterDocument } from '../schemas/counter.schema';

@Injectable()
export class CountersRepository {
  constructor(
    @InjectModel(Counter.name) private readonly model: Model<CounterDocument>,
  ) {}

  /**
   * Atomically increments and returns the next sequence for `key`.
   * Safe under concurrent calls - MongoDB serializes findOneAndUpdate per document.
   */
  async getNextSequence(key: string): Promise<number> {
    const counter = await this.model
      .findOneAndUpdate(
        { _id: key },
        { $inc: { seq: 1 } },
        { upsert: true, new: true },
      )
      .exec();
    return counter.seq;
  }
}
