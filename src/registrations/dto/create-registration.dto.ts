import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class CreateRegistrationDto {
  @ApiProperty({ description: 'Participant id' })
  @IsMongoId()
  participantId: string;

  @ApiProperty({ description: 'Event id' })
  @IsMongoId()
  eventId: string;
}
