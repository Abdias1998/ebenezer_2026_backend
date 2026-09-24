import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PaymentIntentDocument = HydratedDocument<PaymentIntent>;

/**
 * Rejoue du paiement Mobile Money initié via FeexPay. Conservé côté serveur
 * à l'initiation : FeexPay nous renverra la référence dans son webhook, et le
 * `callbackInfo` stocké ici permet de recréer l'inscription même si le
 * navigateur du payeur a été fermé avant la confirmation.
 */
@Schema({ timestamps: true, collection: 'payment_intents' })
export class PaymentIntent {
  @Prop({ required: true, unique: true })
  reference: string;

  @Prop({ trim: true })
  network?: string;

  @Prop({ type: Number })
  amount?: number;

  @Prop({ trim: true })
  phoneNumber?: string;

  @Prop({ type: Object })
  callbackInfo?: Record<string, unknown>;
}

export const PaymentIntentSchema =
  SchemaFactory.createForClass(PaymentIntent);