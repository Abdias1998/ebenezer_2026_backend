import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsObject,
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

  @ApiPropertyOptional({
    description:
      "Données du payeur (tout ce qui a été saisi dans le formulaire). FeexPay les renvoie intactes dans le callback/webhook, ce qui permet de rattacher chaque paiement à son inscription.",
    type: Object,
    example: {
      email: 'vous@exemple.com',
      phone: '+229 97 00 00 00',
      city: 'Cotonou',
      country: 'Bénin',
      church: 'Centre La Grâce Parle Jericho',
      tshirtSize: 'L',
      pickupLocation: 'CEG Godomey',
      paymentNetwork: 'celtiis_bj',
      paymentPhone: '0140433935',
    },
  })
  @IsOptional()
  @IsObject()
  callbackInfo?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      "URL de notification FeexPay (webhook). Si absente, la variable d'environnement FEEXPAY_CALLBACK_URL est utilisée.",
  })
  @IsOptional()
  @IsString()
  callbackUrl?: string;
}