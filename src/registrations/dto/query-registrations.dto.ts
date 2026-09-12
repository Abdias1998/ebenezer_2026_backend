import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsMongoId, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export class QueryRegistrationsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: "Filtrer par événement (identifiant Mongo de l'événement)",
  })
  @IsOptional()
  @IsMongoId()
  event?: string;

  @ApiPropertyOptional({
    description:
      "Ne renvoyer que les inscriptions payées, i.e. avec une référence de paiement ('true')",
  })
  @IsOptional()
  @IsBooleanString()
  paid?: string;
}