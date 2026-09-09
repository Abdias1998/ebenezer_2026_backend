import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RecruitmentDocument = HydratedDocument<Recruitment>;

export enum RecruitmentStatus {
  PENDING = 'pending',
  REVIEWED = 'reviewed',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

export enum Gender {
  M = 'M',
  F = 'F',
}

export enum EducationLevel {
  CEPE = 'CEPE',
  BEPC = 'BEPC',
  BAC = 'BAC',
  BTS = 'BTS',
  LICENCE = 'LICENCE',
  MASTER = 'MASTER',
  DOCTORAT = 'DOCTORAT',
  AUTRE = 'AUTRE',
}

@Schema({ timestamps: true })
export class Recruitment {
  // ── Informations personnelles ──
  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ required: true, type: String, enum: Gender })
  gender: Gender;

  @Prop({ required: true })
  dateOfBirth: Date;

  @Prop({ required: true, trim: true })
  phone: string;

  @Prop({ trim: true })
  whatsapp?: string;

  @Prop({ required: true, trim: true, lowercase: true })
  email: string;

  // ── Adresse ──
  @Prop({ trim: true })
  address?: string;

  @Prop({ trim: true })
  city?: string;

  @Prop({ trim: true, default: 'Bénin' })
  country?: string;

  // ── Formation ──
  @Prop({ type: String, enum: EducationLevel, required: true })
  educationLevel: EducationLevel;

  @Prop({ trim: true })
  school?: string;

  @Prop({ trim: true })
  fieldOfStudy?: string;

  @Prop()
  graduationYear?: number;

  // ── Expérience professionnelle ──
  @Prop({ trim: true })
  previousJob?: string;

  @Prop({ trim: true })
  company?: string;

  @Prop({ trim: true })
  duration?: string;

  @Prop({ type: [String], default: [] })
  skills: string[];

  // ── Informations ecclésiales ──
  @Prop({ required: true, trim: true })
  churchName: string;

  @Prop({ trim: true })
  pastorName?: string;

  @Prop()
  yearsInChurch?: number;

  @Prop({ trim: true })
  currentMinistry?: string;

  // ── Motivation ──
  @Prop({ required: true, trim: true })
  desiredPosition: string;

  @Prop({ required: true, trim: true })
  motivation: string;

  @Prop({ trim: true })
  availability?: string;

  @Prop({ trim: true })
  additionalInfo?: string;

  // ── Statut ──
  @Prop({
    type: String,
    enum: RecruitmentStatus,
    default: RecruitmentStatus.PENDING,
  })
  status: RecruitmentStatus;
}

export const RecruitmentSchema =
  SchemaFactory.createForClass(Recruitment);
