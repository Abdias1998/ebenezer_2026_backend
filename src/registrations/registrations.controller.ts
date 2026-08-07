import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { photoUploadOptions } from 'src/common/config/photo-upload.config';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { PublicRegisterDto } from './dto/public-register.dto';
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
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('photo', photoUploadOptions))
  createPublic(
    @Body() dto: PublicRegisterDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    if (!photo) {
      throw new BadRequestException('La photo est obligatoire');
    }
    const photoPath = `/uploads/participants/${photo.filename}`;
    return this.registrationsService.createPublic(dto, photoPath);
  }

  @Post()
  @Permissions(PERMISSIONS.REGISTRATIONS.CREATE)
  create(@Body() dto: CreateRegistrationDto) {
    return this.registrationsService.create(dto);
  }

  @Get()
  @Permissions(PERMISSIONS.REGISTRATIONS.READ)
  findAll(@Query() query: PaginationQueryDto) {
    return this.registrationsService.findAll(query);
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
