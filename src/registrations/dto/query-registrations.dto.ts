import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBooleanString,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';
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

  @ApiPropertyOptional({ description: "Taille de t-shirt (ex : 'L')" })
  @IsOptional()
  @IsString()
  tshirtSize?: string;

  @ApiPropertyOptional({
    description: 'Lieu de prise en charge (ex : Centre La Grâce Parle Jericho)',
  })
  @IsOptional()
  @IsString()
  pickupLocation?: string;

  @ApiPropertyOptional({ description: 'Ville (ex : Cotonou)' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Église / organisation' })
  @IsOptional()
  @IsString()
  church?: string;

  @ApiPropertyOptional({
    description: 'Réseau de paiement (mtn, moov, celtiis_bj)',
  })
  @IsOptional()
  @IsString()
  paymentNetwork?: string;

  @ApiPropertyOptional({
    description: 'Statut de l\'inscription (pending, confirmed, cancelled, checked-in)',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Recherche libre sur le nom, prénom, email ou téléphone',
  })
  @IsOptional()
  @IsString()
  search?: string;
}