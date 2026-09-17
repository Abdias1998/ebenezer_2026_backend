import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InitiatePaymentDto,
  PayinNetwork,
} from './dto/initiate-payment.dto';

export type FeexPayStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED';

export interface FeexPayStatusResponse {
  reference: string;
  status: FeexPayStatus;
  amount?: number;
  phoneNumber?: string;
  reason?: string;
}

const REASON_LABELS: Record<string, string> = {
  LOW_BALANCE_OR_PAYEE_LIMIT_REACHED_OR_NOT_ALLOWED:
    'Solde insuffisant ou limite de paiement de votre compte atteinte.',
  EXCEEDED_LIMIT: 'Vous avez dépassé la limite de paiement autorisée.',
  TRANSACTION_FAILED: 'La transaction a échoué chez l\u2019opérateur.',
  INSUFFICIENT_FUNDS: 'Solde insuffisant pour effectuer ce paiement.',
  OPERATION_TIMED_OUT:
    'L\u2019opération a expiré. Vous n\u2019avez pas confirmé le paiement à temps.',
  PAYEE_NOT_REACHABLE: 'Le numéro indiqué n\u2019est pas joignable.',
  INVALID_PHONE_NUMBER: 'Le numéro Mobile Money est invalide pour ce réseau.',
};

export function readablePaymentReason(reason?: string): string {
  if (!reason) return '';
  return REASON_LABELS[reason] ?? `Motif : ${reason}`;
}

const SUCCESS_STATUSES = new Set([
  'SUCCESSFUL',
  'SUCCESS',
  'SUCCEEDED',
  'PAID',
  'COMPLETED',
  'CONFIRMED',
]);

const FAILED_STATUSES = new Set([
  'FAILED',
  'FAIL',
  'FAILURE',
  'TIMEOUT',
  'EXPIRED',
  'CANCELLED',
  'CANCELED',
  'REJECTED',
  'DECLINED',
  'REFUSED',
  'INSUFFICIENT_FUNDS',
  'EXCEEDED_LIMIT',
  'TRANSACTION_FAILED',
  'OPERATION_TIMED_OUT',
  'PAYEE_NOT_REACHABLE',
  'INVALID_PHONE_NUMBER',
  'LOW_BALANCE_OR_PAYEE_LIMIT_REACHED_OR_NOT_ALLOWED',
]);

/**
 * Normalise le statut renvoyé par FeexPay vers la valeur canonique
 * PENDING | SUCCESSFUL | FAILED. FeexPay n'est pas cohérent d'un réseau à
 * l'autre (p. ex. Celtiis peut renvoyer "SUCCESS", "TIMEOUT" ou
 * "INSUFFICIENT_FUNDS") : sans cette normalisation, les paiements confirmés
 * restaient "en attente" et n'apparaissaient jamais dans le backend admin.
 */
export function normalizeFeexpayStatus(raw?: unknown): FeexPayStatus {
  const value = String(raw ?? '').trim().toUpperCase();
  if (SUCCESS_STATUSES.has(value)) return 'SUCCESSFUL';
  if (FAILED_STATUSES.has(value)) return 'FAILED';
  return 'PENDING';
}

function extractStatus(json: any): FeexPayStatus {
  return normalizeFeexpayStatus(json?.status ?? json?.responsecode);
}

const NETWORK_ENDPOINTS: Record<PayinNetwork, string> = {
  mtn: 'mtn',
  moov: 'moov',
  celtiis_bj: 'celtiis_bj',
};

const NETWORK_CODES: Record<PayinNetwork, string> = {
  mtn: 'MTN',
  moov: 'MOOV',
  celtiis_bj: 'CELTIIS',
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly shopId: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('feexpay.baseUrl') ??
      'https://api-v2.feexpay.me';
    this.apiKey = this.configService.get<string>('feexpay.apiKey') ?? '';
    this.shopId = this.configService.get<string>('feexpay.shopId') ?? '';
  }

  private ensureConfigured(): void {
    if (!this.apiKey || !this.shopId) {
      throw new BadRequestException(
        'Paiement indisponible : FeexPay n\u2019est pas configuré.',
      );
    }
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<any> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new BadRequestException(
        json?.message ||
          json?.responsemsg ||
          json?.reason ||
          'Une erreur est survenue avec la passerelle de paiement.',
      );
    }

    return json;
  }

  /**
   * Normalise un numéro béninois vers le format international attendu par
   * FeexPay : "229" + "01" + 8 chiffres. Le préfixe national "01" et le
   * code pays "229" sont ajoutés automatiquement s'ils sont absents.
   */
  private toInternational(phoneNumber: string): string {
    let digits = phoneNumber.replace(/\D/g, '');
    if (digits.startsWith('00')) {
      digits = digits.slice(2);
    }
    if (digits.startsWith('229')) {
      digits = digits.slice(3);
    }
    if (!digits.startsWith('01')) {
      digits = `01${digits}`;
    }
    return `229${digits}`;
  }

  async initiate(
    dto: InitiatePaymentDto,
  ): Promise<{
    reference: string;
    network: PayinNetwork;
    amount: number;
    status: FeexPayStatus;
    reason?: string;
  }> {
    this.ensureConfigured();

    const endpoint = NETWORK_ENDPOINTS[dto.network];
    const json = await this.request(
      `/api/transactions/public/requesttopay/${endpoint}`,
      {
        method: 'POST',
        body: JSON.stringify({
          shop: this.shopId,
          amount: dto.amount,
          phoneNumber: this.toInternational(dto.phoneNumber),
          first_name: dto.firstName,
          last_name: dto.lastName,
          callback_info: dto.callbackInfo,
        }),
      },
    );

    const reference =
      json?.reference ??
      json?.transref ??
      json?.order_id ??
      json?.trx_id ??
      json?.reference_id;

    if (!reference) {
      this.logger.warn('FeexPay requestToPay did not return a reference');
      throw new BadRequestException(
        'Impossible de lancer le paiement. Réessayez dans un instant.',
      );
    }

    return {
      reference,
      network: dto.network,
      amount: dto.amount,
      status: extractStatus(json),
      reason: (json?.reason as string) ?? (json?.responsemsg as string) ?? undefined,
    };
  }

  async getStatus(reference: string): Promise<FeexPayStatusResponse> {
    this.ensureConfigured();

    const json = await this.request(
      `/api/transactions/public/single/status/${reference}`,
      { method: 'GET' },
    );

    const rawStatus = json?.status ?? json?.responsecode ?? 'PENDING';
    const status = extractStatus(json);
    if (String(rawStatus).toUpperCase().trim() !== status) {
      this.logger.debug(
        `FeexPay status for ${reference} was "${rawStatus}", normalized to "${status}"`,
      );
    }

    return {
      reference: json?.reference ?? reference,
      status,
      amount: json?.amount as number | undefined,
      phoneNumber: json?.phoneNumber as string | undefined,
      reason: (json?.reason as string) ?? (json?.responsemsg as string) ?? undefined,
    };
  }
}