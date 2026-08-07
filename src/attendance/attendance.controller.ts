import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from 'src/auth/interfaces/authenticated-user.interface';
import { PERMISSIONS } from 'src/common/constants/permissions.constant';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { AttendanceService } from './attendance.service';
import { ScanDto } from './dto/scan.dto';

@ApiTags('attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('scan')
  @Permissions(PERMISSIONS.ATTENDANCE.CREATE)
  scan(@Body() dto: ScanDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.scan(dto, user.userId);
  }

  @Get('participant/:participantId')
  @Permissions(PERMISSIONS.ATTENDANCE.READ)
  findByParticipant(
    @Param('participantId') participantId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.attendanceService.findByParticipant(participantId, query);
  }

  @Get('event/:eventId/day/:date')
  @Permissions(PERMISSIONS.ATTENDANCE.READ)
  findByEventAndDay(
    @Param('eventId') eventId: string,
    @Param('date') date: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.attendanceService.findByEventAndDay(eventId, date, query);
  }
}
