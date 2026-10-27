import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString } from 'class-validator';

export class ScanDto {
  @ApiProperty({ description: 'Raw QR code content read by the scanner' })
  @IsString()
  qrContent: string;

  @ApiPropertyOptional({
    description:
      "Événement en cours de contrôle : un billet d'un autre événement est refusé",
  })
  @IsOptional()
  @IsMongoId()
  eventId?: string;
}

export class ManualCheckInDto {
  @ApiPropertyOptional({
    description:
      "Événement en cours de contrôle : un billet d'un autre événement est refusé",
  })
  @IsOptional()
  @IsMongoId()
  eventId?: string;
}
