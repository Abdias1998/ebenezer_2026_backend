import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * Permet à l'admin de créer manuellement une inscription à partir d'une
 * référence de paiement FeexPay déjà confirmée (rattrapage des paiements
 * dont l'inscription n'a jamais abouti).
 */
export class AdminRattrapageDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tshirtSize?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pickupLocation?: string;

  @ApiProperty({ description: 'Event id' })
  @IsMongoId()
  eventId: string;

  @ApiProperty({
    description:
      'Référence de transaction FeexPay déjà réussie. Elle est vérifiée (statut SUCCESSFUL) avant la génération du billet.',
    example: 'AG_20260917_7016dcd9c0eYp01LIL9D',
  })
  @IsString()
  paymentRef: string;

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
  @IsInt()
  @Min(0)
  paymentAmount?: number;
}