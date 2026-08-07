import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { RegistrationStatus } from '../schemas/registration.schema';

export class UpdateRegistrationStatusDto {
  @ApiProperty({ enum: RegistrationStatus })
  @IsEnum(RegistrationStatus)
  status: RegistrationStatus;
}
