import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ScanDto {
  @ApiProperty({ description: 'Raw QR code content read by the scanner' })
  @IsString()
  qrContent: string;
}
