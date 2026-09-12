import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { PublicRegisterDto } from './dto/public-register.dto';
import { QueryRegistrationsDto } from './dto/query-registrations.dto';
import { UpdateRegistrationStatusDto } from './dto/update-registration-status.dto';
import { RegistrationsService } from './registrations.service';

@ApiTags('registrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('registrations')
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Public()
  @Post('public')
  createPublic(@Body() dto: PublicRegisterDto) {
    return this.registrationsService.createPublic(dto);
  }

  @Post()
  @Permissions(PERMISSIONS.REGISTRATIONS.CREATE)
  create(@Body() dto: CreateRegistrationDto) {
    return this.registrationsService.create(dto);
  }

  @Get()
  @Permissions(PERMISSIONS.REGISTRATIONS.READ)
  findAll(@Query() query: QueryRegistrationsDto) {
    return this.registrationsService.findAll(query);
  }

  @Get('export')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="inscrits.pdf"')
  @Permissions(PERMISSIONS.REGISTRATIONS.READ)
  async exportPdf(
    @Query() query: QueryRegistrationsDto,
    @Res() res: Response,
  ) {
    const buffer = await this.registrationsService.exportPdf(query);
    res.send(buffer);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.REGISTRATIONS.READ)
  findOne(@Param('id') id: string) {
    return this.registrationsService.findById(id);
  }

  @Get(':id/qrcode')
  @Permissions(PERMISSIONS.REGISTRATIONS.READ)
  getQrCode(@Param('id') id: string) {
    return this.registrationsService.getQrCode(id);
  }

  @Patch(':id/status')
  @Permissions(PERMISSIONS.REGISTRATIONS.UPDATE)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateRegistrationStatusDto,
  ) {
    return this.registrationsService.updateStatus(id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.REGISTRATIONS.DELETE)
  remove(@Param('id') id: string) {
    return this.registrationsService.remove(id);
  }
}
