import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Suggestion, SuggestionSchema } from './schemas/suggestion.schema';
import { SuggestionsRepository } from './repositories/suggestions.repository';
import { SuggestionsService } from './suggestions.service';
import { SuggestionsController } from './suggestions.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Suggestion.name, schema: SuggestionSchema },
    ]),
  ],
  controllers: [SuggestionsController],
  providers: [SuggestionsRepository, SuggestionsService],
})
export class SuggestionsModule {}
