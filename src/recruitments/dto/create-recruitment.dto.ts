import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';
import {
  EducationLevel,
  Gender,
} from '../schemas/recruitment.schema';

export class CreateRecruitmentDto {
  // ── Informations personnelles ──
  @ApiProperty({ example: 'Jean' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Dupont' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ enum: Gender })
  @IsEnum(Gender)
  gender: Gender;

  @ApiProperty({ example: '1990-05-15' })
  @IsDateString()
  dateOfBirth: string;

  @ApiProperty({ example: '+229 97 00 00 00' })
  @IsString()
  @MinLength(6)
  @MaxLength(30)
  phone: string;

  @ApiPropertyOptional({ example: '+229 97 00 00 00' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsapp?: string;

  @ApiProperty({ example: 'jean@example.com' })
  @IsEmail()
  @MaxLength(200)
  email: string;

  // ── Adresse ──
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ default: 'Bénin' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  // ── Formation ──
  @ApiProperty({ enum: EducationLevel })
  @IsEnum(EducationLevel)
  educationLevel: EducationLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  school?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fieldOfStudy?: string;

  @ApiPropertyOptional({ example: 2020 })
  @IsOptional()
  @IsNumber()
  @Min(1950)
  graduationYear?: number;

  // ── Expérience professionnelle ──
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  previousJob?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @ApiPropertyOptional({ example: '2 ans' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  duration?: string;

  @ApiPropertyOptional({ type: [String], example: ['Word', 'Excel', 'Comptabilité'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  // ── Informations ecclésiales ──
  @ApiProperty({ example: 'Eglise Cénacle de la Foi' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  churchName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  pastorName?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  yearsInChurch?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentMinistry?: string;

  // ── Motivation ──
  @ApiProperty({ example: 'Responsable de la louange' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  desiredPosition: string;

  @ApiProperty({ example: 'Je souhaite m\'engager dans le service...' })
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  motivation: string;

  @ApiPropertyOptional({ example: 'Immédiatement' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  availability?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  additionalInfo?: string;
}
