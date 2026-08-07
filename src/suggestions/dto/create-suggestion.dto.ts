import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSuggestionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Phone, WhatsApp or email to reach back' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contact?: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  message: string;
}
