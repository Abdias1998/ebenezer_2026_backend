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
import { CreateRecruitmentDto } from './dto/create-recruitment.dto';
import { RecruitmentsService } from './recruitments.service';
import { RecruitmentStatus } from './schemas/recruitment.schema';

@ApiTags('recruitments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('recruitments')
export class RecruitmentsController {
  constructor(
    private readonly recruitmentsService: RecruitmentsService,
  ) {}

  @Public()
  @Post()
  create(@Body() dto: CreateRecruitmentDto) {
    return this.recruitmentsService.create(dto);
  }

  @Get()
  @Permissions(PERMISSIONS.RECRUITMENTS.READ)
  findAll(@Query() query: PaginationQueryDto) {
    return this.recruitmentsService.findAll(query);
  }

  @Public()
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.recruitmentsService.findById(id);
  }

  @Patch(':id/status')
  @Permissions(PERMISSIONS.RECRUITMENTS.UPDATE)
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: RecruitmentStatus,
  ) {
    return this.recruitmentsService.updateStatus(id, status);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.RECRUITMENTS.DELETE)
  remove(@Param('id') id: string) {
    return this.recruitmentsService.remove(id);
  }
}
