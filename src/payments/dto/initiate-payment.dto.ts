import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Matches, Max, Min } from 'class-validator';

export const PAYIN_NETWORKS = ['mtn', 'moov', 'celtiis_bj'] as const;
export type PayinNetwork = (typeof PAYIN_NETWORKS)[number];

const BENIN_PHONE_REGEX = /^(?:(?:\+|00)?229)?01\d{8}$/;

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
      'Numéro Mobile Money du payeur (format national 01XXXXXXXX ou international +229XXXXXXXX)',
    example: '0190000000',
  })
  @IsString()
  @Matches(BENIN_PHONE_REGEX, {
    message: 'Numéro Mobile Money invalide (format Bénin attendu : 01XXXXXXXX ou +229XXXXXXXX)',
  })
  phoneNumber: string;
}