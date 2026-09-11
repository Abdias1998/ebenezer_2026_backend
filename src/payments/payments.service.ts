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
   * FeexPay : "229" + "01" + 8 chiffres.
   */
  private toInternational(phoneNumber: string): string {
    const digits = phoneNumber.replace(/\D/g, '');
    if (digits.startsWith('229')) return digits;
    return `229${digits}`;
  }

  async initiate(
    dto: InitiatePaymentDto,
  ): Promise<{ reference: string; network: PayinNetwork; amount: number }> {
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
        }),
      },
    );

    const reference =
      json?.reference ?? json?.order_id ?? json?.trx_id ?? json?.reference_id;

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
    };
  }

  async getStatus(reference: string): Promise<FeexPayStatusResponse> {
    this.ensureConfigured();

    const json = await this.request(
      `/api/transactions/public/single/status/${reference}`,
      { method: 'GET' },
    );

    return {
      reference: json?.reference ?? reference,
      status: (json?.status ?? json?.responsecode ?? 'PENDING') as FeexPayStatus,
      amount: json?.amount as number | undefined,
      phoneNumber: json?.phoneNumber as string | undefined,
    };
  }
}