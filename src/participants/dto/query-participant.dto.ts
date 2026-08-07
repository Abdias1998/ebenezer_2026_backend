import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import {
  ParticipantGender,
  ParticipantStatus,
} from '../schemas/participant.schema';

export class QueryParticipantDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Free-text search across firstName/lastName/email/phone',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ParticipantGender })
  @IsOptional()
  @IsEnum(ParticipantGender)
  gender?: ParticipantGender;

  @ApiPropertyOptional({ enum: ParticipantStatus })
  @IsOptional()
  @IsEnum(ParticipantStatus)
  status?: ParticipantStatus;
}
