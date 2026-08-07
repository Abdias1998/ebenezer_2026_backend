import { Injectable, NotFoundException } from '@nestjs/common';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { PaginatedResult } from 'src/common/interfaces/paginated-result.interface';
import { CreateSuggestionDto } from './dto/create-suggestion.dto';
import { SuggestionsRepository } from './repositories/suggestions.repository';
import { SuggestionDocument, SuggestionStatus } from './schemas/suggestion.schema';

@Injectable()
export class SuggestionsService {
  constructor(private readonly suggestionsRepository: SuggestionsRepository) {}

  create(dto: CreateSuggestionDto): Promise<SuggestionDocument> {
    return this.suggestionsRepository.create({ ...dto });
  }

  findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<SuggestionDocument>> {
    return this.suggestionsRepository.findAll({}, query);
  }

  async markAsRead(id: string): Promise<SuggestionDocument> {
    const suggestion = await this.suggestionsRepository.updateById(id, {
      status: SuggestionStatus.READ,
    });
    if (!suggestion) {
      throw new NotFoundException('Suggestion not found');
    }
    return suggestion;
  }

  async remove(id: string): Promise<void> {
    const suggestion = await this.suggestionsRepository.deleteById(id);
    if (!suggestion) {
      throw new NotFoundException('Suggestion not found');
    }
  }
}
