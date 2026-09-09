import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Recruitment,
  RecruitmentSchema,
} from './schemas/recruitment.schema';
import { RecruitmentsRepository } from './repositories/recruitments.repository';
import { RecruitmentsService } from './recruitments.service';
import { RecruitmentsController } from './recruitments.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Recruitment.name, schema: RecruitmentSchema },
    ]),
  ],
  controllers: [RecruitmentsController],
  providers: [RecruitmentsRepository, RecruitmentsService],
})
export class RecruitmentsModule {}
