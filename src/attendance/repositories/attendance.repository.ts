import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/repositories/base.repository';
import { Attendance, AttendanceDocument } from '../schemas/attendance.schema';

@Injectable()
export class AttendanceRepository extends BaseRepository<AttendanceDocument> {
  constructor(
    @InjectModel(Attendance.name) model: Model<AttendanceDocument>,
  ) {
    super(model);
  }
}
