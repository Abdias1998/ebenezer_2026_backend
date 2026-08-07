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
   * Builds the signed token embedded in the QR image: `registrationId.code.hmac`.
   * The signature only proves the token was minted by this server - it does
   * not replace the DB lookup for status/duplicate-scan checks.
   */
  buildToken(registrationId: string, code: string): string {
    const signature = this.sign(registrationId, code);
    return [registrationId, code, signature].join(TOKEN_SEPARATOR);
  }

  async toImageDataUrl(token: string): Promise<string> {
    return QRCode.toDataURL(token);
  }

  verify(token: string): QrPayload {
    const parts = token.split(TOKEN_SEPARATOR);
    if (parts.length !== 3) {
      throw new BadRequestException('Invalid QR code');
    }
    const [registrationId, code, signature] = parts;
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
