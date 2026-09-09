import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/repositories/base.repository';
import {
  Recruitment,
  RecruitmentDocument,
} from '../schemas/recruitment.schema';

@Injectable()
export class RecruitmentsRepository extends BaseRepository<RecruitmentDocument> {
  constructor(
    @InjectModel(Recruitment.name) model: Model<RecruitmentDocument>,
  ) {
    super(model);
  }
}
