import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export const PAYIN_NETWORKS = ['mtn', 'moov', 'celtiis_bj'] as const;
export type PayinNetwork = (typeof PAYIN_NETWORKS)[number];

const BENIN_PHONE_REGEX =
  /^\s*\+?\s*(?:00\s*)?(?:229\s*)?(?:01\s*)?[1-9]\s*(?:\d\s*){7}\s*$/;

export class InitiatePaymentDto {
  @ApiProperty({
    description: 'Réseau Mobile Money (Bénin uniquement)',
    enum: PAYIN_NETWORKS,
  })
  @IsIn(PAYIN_NETWORKS)
  network: PayinNetwork;

  @ApiProperty({ description: 'Montant en FCFA (XOF), minimum 100', example: 7000 })
  @IsInt()
  @Min(100)
  @Max(10_000_000)
  amount: number;

  @ApiProperty({
    description:
      "Numéro Mobile Money du payeur. Le préfixe 01 et le code pays 229 sont ajoutés automatiquement si absents. Formats acceptés : 67919150, 0167919150, +2290167919150",
    example: '0167919150',
  })
  @IsString()
  @Matches(BENIN_PHONE_REGEX, {
    message:
      "Numéro Mobile Money invalide (ex : 67919150, 0167919150 ou +2290167919150)",
  })
  phoneNumber: string;

  @ApiPropertyOptional({
    description: 'Prénom du payeur (envoyé à FeexPay)',
    example: 'Jean-Marc',
  })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Nom du payeur (envoyé à FeexPay)',
    example: 'Dupont',
  })
  @IsOptional()
  @IsString()
  lastName?: string;
}