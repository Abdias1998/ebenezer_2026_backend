import {
  Body,
  Controller,
  Header,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/decorators/public.decorator';
import { RegistrationsService } from './registrations.service';

/**
 * Webhook FeexPay (notification serveur-à-serveur de changement de statut).
 *
 * URL : POST /api/v1/payments/callback — à renseigner dans le dashboard
 * marchand FeexPay (onglet développeur) et/ou envoyée via `callback_url`
 * à l'initiation du paiement.
 *
 * FeexPay retente l'envoi tant que le backend ne répond pas en 2xx : on ack
 * rapidement puis on crée l'inscription de façon idempotente.
 */
@ApiTags('payments')
@Controller('payments/callback')
export class FeexpayCallbackController {
  constructor(
    private readonly registrationsService: RegistrationsService,
  ) {}

  @Public()
  @Post()
  @Header('Content-Type', 'application/json')
  async handle(
    @Body() payload: Record<string, unknown>,
  ): Promise<{ received: boolean }> {
    await this.registrationsService.completeFromPaymentWebhook(payload ?? {});
    return { received: true };
  }
}