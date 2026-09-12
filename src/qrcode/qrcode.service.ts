import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import { QrPayload } from './interfaces/qr-payload.interface';

const TOKEN_SEPARATOR = '.';

@Injectable()
export class QrcodeService {
  private readonly secret: string;

  constructor(configService: ConfigService) {
    this.secret = configService.get<string>('qrSecret')!;
  }

  generateOpaqueCode(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Builds the signed JSON payload embedded in the QR image. The signature
   * (HMAC over `registrationId.code`) only proves the token was minted by
   * this server. All the participant info is embedded as human-readable
   * data, but the DB lookup remains the source of truth for the status.
   */
  buildToken(
    registrationId: string,
    code: string,
    info: Record<string, unknown> = {},
  ): string {
    const signature = this.sign(registrationId, code);
    return JSON.stringify({
      registrationId,
      code,
      signature,
      ...info,
    });
  }

  async toImageDataUrl(token: string): Promise<string> {
    return QRCode.toDataURL(token);
  }

  verify(token: string): QrPayload {
    let registrationId: string;
    let code: string;
    let signature: string;

    try {
      const parsed = JSON.parse(token) as {
        registrationId?: unknown;
        code?: unknown;
        signature?: unknown;
      };
      if (
        typeof parsed.registrationId !== 'string' ||
        typeof parsed.code !== 'string' ||
        typeof parsed.signature !== 'string'
      ) {
        throw new Error('malformed JSON payload');
      }
      registrationId = parsed.registrationId;
      code = parsed.code;
      signature = parsed.signature;
    } catch {
      // Backward compatibility: legacy "registrationId.code.signature" tokens
      const parts = token.split(TOKEN_SEPARATOR);
      if (parts.length !== 3) {
        throw new BadRequestException('Invalid QR code');
      }
      [registrationId, code, signature] = parts;
    }

    const expectedSignature = this.sign(registrationId, code);

    const provided = Buffer.from(signature, 'hex');
    const expected = Buffer.from(expectedSignature, 'hex');

    if (
      provided.length !== expected.length ||
      !crypto.timingSafeEqual(provided, expected)
    ) {
      throw new BadRequestException('Invalid or tampered QR code');
    }

    return { registrationId, code };
  }

  private sign(registrationId: string, code: string): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(`${registrationId}${TOKEN_SEPARATOR}${code}`)
      .digest('hex');
  }
}
