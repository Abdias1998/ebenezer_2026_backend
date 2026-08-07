import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SuggestionDocument = HydratedDocument<Suggestion>;

export enum SuggestionStatus {
  NEW = 'new',
  READ = 'read',
}

@Schema({ timestamps: true })
export class Suggestion {
  @Prop({ trim: true })
  name?: string;

  @Prop({ trim: true })
  contact?: string;

  @Prop({ required: true, trim: true })
  message: string;

  @Prop({ type: String, enum: SuggestionStatus, default: SuggestionStatus.NEW })
  status: SuggestionStatus;
}

export const SuggestionSchema = SchemaFactory.createForClass(Suggestion);
