import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RegistrationDocument = HydratedDocument<Registration>;

export enum RegistrationStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  CHECKED_IN = 'checked-in',
}

@Schema({ timestamps: true })
export class Registration {
  @Prop({ type: Types.ObjectId, ref: 'Participant', required: true })
  participant: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Event', required: true })
  event: Types.ObjectId;

  @Prop({ required: true, unique: true })
  registrationNumber: string;

  @Prop({ required: true, unique: true })
  code: string;

  @Prop({
    type: String,
    enum: RegistrationStatus,
    default: RegistrationStatus.PENDING,
  })
  status: RegistrationStatus;

  @Prop({ unique: true, sparse: true })
  paymentRef?: string;

  @Prop({ trim: true })
  paymentNetwork?: string;

  @Prop({ trim: true })
  paymentPhone?: string;

  @Prop({ type: Number })
  paymentAmount?: number;
}

export const RegistrationSchema = SchemaFactory.createForClass(Registration);
RegistrationSchema.index({ participant: 1, event: 1 }, { unique: true });
