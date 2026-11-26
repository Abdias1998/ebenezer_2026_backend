import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import { QrPayload } from './interfaces/qr-payload.interface';

const TOKEN_SEPARATOR = '.';
const ENCRYPTED_PREFIX = 'EBZ1.';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
/** Page admin qui vérifie un billet ouvert depuis l'appareil photo du téléphone. */
const VERIFY_PATH = '/admin/verifier';
const VERIFY_PARAM = 't';

@Injectable()
export class QrcodeService {
  private readonly secret: string;
  private readonly encryptionKey: Buffer;
  private readonly frontendUrl?: string;

  constructor(configService: ConfigService) {
    this.secret = configService.get<string>('qrSecret')!;
    this.frontendUrl = configService
      .get<string>('frontendUrl')
      ?.replace(/\/+$/, '');
    this.encryptionKey = crypto
      .createHash('sha256')
      .update(`qr-encryption:${this.secret}`)
      .digest();
  }

  generateOpaqueCode(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Contenu du QR code : `EBZ1.<base64url(iv | tag | chiffré)>`, chiffré en
   * AES-256-GCM avec une clé dérivée de QR_SECRET. Un lecteur de QR ordinaire
   * n'y voit qu'une suite de caractères : seul le serveur (scan admin
   * authentifié) peut le déchiffrer. GCM authentifie aussi le contenu, donc un
   * QR falsifié est rejeté. Aucune donnée personnelle n'y figure.
   *
   * Si FRONTEND_URL est configuré, le jeton est placé dans un lien vers
   * `/admin/verifier` : scanné avec l'appareil photo d'un téléphone, le QR
   * ouvre directement la page de contrôle (connexion admin requise).
   */
  buildToken(registrationId: string, code: string): string {
    const token = this.encrypt(registrationId, code);
    if (!this.frontendUrl) return token;
    return `${this.frontendUrl}${VERIFY_PATH}?${VERIFY_PARAM}=${token}`;
  }

  private encrypt(registrationId: string, code: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(`${registrationId}${TOKEN_SEPARATOR}${code}`, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return (
      ENCRYPTED_PREFIX +
      Buffer.concat([iv, tag, encrypted]).toString('base64url')
    );
  }

  async toImageDataUrl(token: string): Promise<string> {
    return QRCode.toDataURL(token);
  }

  verify(rawContent: string): QrPayload {
    const token = this.extractToken(rawContent.trim());
    if (token.startsWith(ENCRYPTED_PREFIX)) {
      return this.decrypt(token.slice(ENCRYPTED_PREFIX.length));
    }

    // Anciens billets (JSON signé ou « id.code.signature ») déjà distribués :
    // toujours acceptés au scan.
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

  /** Le QR peut contenir un lien `…/admin/verifier?t=<jeton>` ou le jeton seul. */
  private extractToken(content: string): string {
    if (!/^https?:\/\//i.test(content)) return content;
    try {
      return new URL(content).searchParams.get(VERIFY_PARAM) ?? content;
    } catch {
      return content;
    }
  }

  private decrypt(encoded: string): QrPayload {
    try {
      const raw = Buffer.from(encoded, 'base64url');
      if (raw.length <= IV_LENGTH + TAG_LENGTH) {
        throw new Error('too short');
      }
      const iv = raw.subarray(0, IV_LENGTH);
      const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey,
        iv,
      );
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([
        decipher.update(raw.subarray(IV_LENGTH + TAG_LENGTH)),
        decipher.final(),
      ]).toString('utf8');
      const [registrationId, code, ...rest] = plain.split(TOKEN_SEPARATOR);
      if (!registrationId || !code || rest.length > 0) {
        throw new Error('malformed');
      }
      return { registrationId, code };
    } catch {
      throw new BadRequestException('Invalid or tampered QR code');
    }
  }

  private sign(registrationId: string, code: string): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(`${registrationId}${TOKEN_SEPARATOR}${code}`)
      .digest('hex');
  }
}
