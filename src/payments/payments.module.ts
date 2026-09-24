import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import {
  PaymentIntent,
  PaymentIntentSchema,
} from './schemas/payment-intent.schema';
import { PaymentIntentsRepository } from './repositories/payment-intents.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PaymentIntent.name, schema: PaymentIntentSchema },
    ]),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentIntentsRepository],
  exports: [PaymentsService, PaymentIntentsRepository],
})
export class PaymentsModule {}