import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type EventDocument = HydratedDocument<Event>;

export enum EventStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ONGOING = 'ongoing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Schema({ timestamps: true })
export class Event {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  theme?: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ trim: true })
  location?: string;

  @Prop()
  logo?: string;

  @Prop()
  image?: string;

  @Prop({ trim: true })
  registrationPrefix?: string;

  @Prop({ default: 0 })
  totalSlots: number;

  @Prop({ type: String, enum: EventStatus, default: EventStatus.DRAFT })
  status: EventStatus;
}

export const EventSchema = SchemaFactory.createForClass(Event);
