import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ParticipantDocument = HydratedDocument<Participant>;

export enum ParticipantGender {
  MALE = 'M',
  FEMALE = 'F',
}

export enum ParticipantStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
}

@Schema({ _id: false })
class ParticipantHistoryEntry {
  @Prop({ required: true, trim: true })
  action: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  by?: Types.ObjectId;

  @Prop({ default: () => new Date() })
  at: Date;

  @Prop({ trim: true })
  note?: string;
}

@Schema({ timestamps: true })
export class Participant {
  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ type: String, enum: ParticipantGender })
  gender?: ParticipantGender;

  @Prop()
  dob?: Date;

  @Prop({ required: true, trim: true })
  phone: string;

  @Prop({ trim: true })
  whatsapp?: string;

  @Prop({ trim: true, lowercase: true })
  email?: string;

  @Prop()
  photo?: string;

  @Prop({
    type: String,
    enum: ParticipantStatus,
    default: ParticipantStatus.PENDING,
  })
  status: ParticipantStatus;

  @Prop({ type: [ParticipantHistoryEntry], default: [] })
  history: ParticipantHistoryEntry[];

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const ParticipantSchema = SchemaFactory.createForClass(Participant);
