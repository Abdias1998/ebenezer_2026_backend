import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PaymentIntent, PaymentIntentDocument } from '../schemas/payment-intent.schema';

@Injectable()
export class PaymentIntentsRepository {
  constructor(
    @InjectModel(PaymentIntent.name)
    private readonly model: Model<PaymentIntentDocument>,
  ) {}

  async create(data: Record<string, unknown>): Promise<PaymentIntentDocument> {
    const created = new this.model(data);
    return created.save();
  }

  async findById(id: string): Promise<PaymentIntentDocument | null> {
    return this.model.findOne({ _id: id }).exec();
  }

  async findByReference(reference: string): Promise<PaymentIntentDocument | null> {
    return this.model.findOne({ reference }).exec();
  }
}