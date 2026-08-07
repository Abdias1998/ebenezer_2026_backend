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
import { AuthenticatedUser } from 'src/auth/interfaces/authenticated-user.interface';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { CreateParticipantDto } from './dto/create-participant.dto';
import { QueryParticipantDto } from './dto/query-participant.dto';
import { UpdateParticipantDto } from './dto/update-participant.dto';
import { ParticipantsService } from './participants.service';

@ApiTags('participants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('participants')
export class ParticipantsController {
  constructor(private readonly participantsService: ParticipantsService) {}

  @Post()
  @Permissions(PERMISSIONS.PARTICIPANTS.CREATE)
  create(
    @Body() dto: CreateParticipantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.participantsService.create(dto, user.userId);
  }

  @Get()
  @Permissions(PERMISSIONS.PARTICIPANTS.READ)
  findAll(@Query() query: QueryParticipantDto) {
    return this.participantsService.findAll(query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PARTICIPANTS.READ)
  findOne(@Param('id') id: string) {
    return this.participantsService.findById(id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.PARTICIPANTS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateParticipantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.participantsService.update(id, dto, user.userId);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.PARTICIPANTS.DELETE)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.participantsService.remove(id, user.userId);
  }
}
