import { Injectable, NotFoundException } from '@nestjs/common';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { PaginatedResult } from 'src/common/interfaces/paginated-result.interface';
import { CreateRecruitmentDto } from './dto/create-recruitment.dto';
import { RecruitmentsRepository } from './repositories/recruitments.repository';
import {
  RecruitmentDocument,
  RecruitmentStatus,
} from './schemas/recruitment.schema';

@Injectable()
export class RecruitmentsService {
  constructor(
    private readonly recruitmentsRepository: RecruitmentsRepository,
  ) {}

  create(dto: CreateRecruitmentDto): Promise<RecruitmentDocument> {
    return this.recruitmentsRepository.create({ ...dto });
  }

  findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<RecruitmentDocument>> {
    return this.recruitmentsRepository.findAll({}, query);
  }

  async findById(id: string): Promise<RecruitmentDocument> {
    const recruitment = await this.recruitmentsRepository.findById(id);
    if (!recruitment) {
      throw new NotFoundException('Candidature non trouvée');
    }
    return recruitment;
  }

  async updateStatus(
    id: string,
    status: RecruitmentStatus,
  ): Promise<RecruitmentDocument> {
    const recruitment = await this.recruitmentsRepository.updateById(id, {
      status,
    });
    if (!recruitment) {
      throw new NotFoundException('Candidature non trouvée');
    }
    return recruitment;
  }

  async remove(id: string): Promise<void> {
    const recruitment = await this.recruitmentsRepository.deleteById(id);
    if (!recruitment) {
      throw new NotFoundException('Candidature non trouvée');
    }
  }
}
