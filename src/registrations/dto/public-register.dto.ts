import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class PublicRegisterDto {
  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsString()
  lastName: string;

  @ApiPropertyOptional({ enum: ['male', 'female'] })
  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: 'male' | 'female';

  @ApiProperty()
  @IsString()
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsapp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  church?: string;

  @ApiPropertyOptional({ description: 'Titre ministériel (séminaire)' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: "Secteur d'activité (conférence)" })
  @IsOptional()
  @IsString()
  profession?: string;

  @ApiPropertyOptional({ description: 'Entreprise / organisation (conférence)' })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({ description: 'Date de naissance (AAAA-MM-JJ)' })
  @IsOptional()
  @IsDateString()
  dob?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tshirtSize?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pickupLocation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  acceptTerms?: string;

  @ApiProperty({ description: 'Event id' })
  @IsMongoId()
  eventId: string;

  @ApiPropertyOptional({
    description:
      'Référence de transaction FeexPay. Si fournie, la transaction est vérifiée (statut SUCCESSFUL) avant la génération du billet.',
  })
  @IsOptional()
  @IsString()
  paymentRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentNetwork?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  paymentAmount?: number;
}
