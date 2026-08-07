import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/repositories/base.repository';
import { Suggestion, SuggestionDocument } from '../schemas/suggestion.schema';

@Injectable()
export class SuggestionsRepository extends BaseRepository<SuggestionDocument> {
  constructor(@InjectModel(Suggestion.name) model: Model<SuggestionDocument>) {
    super(model);
  }
}
