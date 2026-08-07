import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { CreateSuggestionDto } from './dto/create-suggestion.dto';
import { SuggestionsService } from './suggestions.service';

@ApiTags('suggestions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('suggestions')
export class SuggestionsController {
  constructor(private readonly suggestionsService: SuggestionsService) {}

  @Public()
  @Post()
  create(@Body() dto: CreateSuggestionDto) {
    return this.suggestionsService.create(dto);
  }

  @Get()
  @Permissions(PERMISSIONS.SUGGESTIONS.READ)
  findAll(@Query() query: PaginationQueryDto) {
    return this.suggestionsService.findAll(query);
  }

  @Patch(':id/read')
  @Permissions(PERMISSIONS.SUGGESTIONS.UPDATE)
  markAsRead(@Param('id') id: string) {
    return this.suggestionsService.markAsRead(id);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.SUGGESTIONS.DELETE)
  remove(@Param('id') id: string) {
    return this.suggestionsService.remove(id);
  }
}
