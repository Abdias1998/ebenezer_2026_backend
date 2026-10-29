import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface TicketMail {
  to: string;
  firstName: string;
  eventName: string;
  registrationNumber: string;
  /** QR code au format data URL (`data:image/png;base64,...`). */
  qrCodeDataUrl: string;
  eventDate?: Date;
  /** Remplace la date pour un événement récurrent (« Tous les vendredis »). */
  eventScheduleLabel?: string;
  eventLocation?: string;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Envoi d'e-mails via SMTP. Si SMTP_HOST n'est pas configuré, les envois
 * sont ignorés (journalisés) : l'inscription ne doit jamais échouer à cause
 * de l'e-mail.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(configService: ConfigService) {
    const host = configService.get<string>('mail.host');
    this.from =
      configService.get<string>('mail.from') ??
      configService.get<string>('mail.user') ??
      'no-reply@localhost';
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: configService.get<number>('mail.port'),
          secure: configService.get<boolean>('mail.secure'),
          auth: configService.get<string>('mail.user')
            ? {
                user: configService.get<string>('mail.user'),
                pass: configService.get<string>('mail.pass'),
              }
            : undefined,
        })
      : null;
  }

  get enabled(): boolean {
    return this.transporter !== null;
  }

  /** Envoie le billet (QR code en pièce jointe et en image intégrée). */
  async sendTicket(mail: TicketMail): Promise<void> {
    if (!this.transporter) {
      this.logger.debug(
        `SMTP non configuré : billet ${mail.registrationNumber} non envoyé par e-mail.`,
      );
      return;
    }

    const base64 = mail.qrCodeDataUrl.split(',')[1] ?? '';
    const name = escapeHtml(mail.firstName);
    const eventName = escapeHtml(mail.eventName);
    const date =
      mail.eventScheduleLabel ??
      mail.eventDate?.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Africa/Porto-Novo',
      });
    const practical = [date, mail.eventLocation]
      .filter(Boolean)
      .map((v) => escapeHtml(String(v)))
      .join(' · ');

    await this.transporter.sendMail({
      from: this.from,
      to: mail.to,
      subject: `Ton billet — ${mail.eventName} (${mail.registrationNumber})`,
      text: [
        `Bonjour ${mail.firstName},`,
        '',
        `Ton inscription à « ${mail.eventName} » est confirmée.`,
        `Numéro d'inscription : ${mail.registrationNumber}`,
        practical ? `Infos : ${[date, mail.eventLocation].filter(Boolean).join(' · ')}` : '',
        '',
        "Ton QR code est joint à cet e-mail : présente-le à l'arrivée, il sera scanné pour enregistrer ta présence.",
        '',
        "L'inscription est 100 % gratuite.",
      ].join('\n'),
      html: `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#111827">
  <div style="background:#0a1640;color:#ffffff;padding:24px;border-radius:16px 16px 0 0;text-align:center">
    <p style="margin:0;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#fcd34d">Inscription confirmée</p>
    <h1 style="margin:8px 0 0;font-size:22px">${eventName}</h1>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:0;padding:24px;border-radius:0 0 16px 16px;text-align:center">
    <p style="margin:0 0 12px">Bonjour <strong>${name}</strong>,</p>
    <p style="margin:0 0 16px">Ton inscription est confirmée. Présente ce QR code à ton arrivée : il sera scanné pour enregistrer ta présence.</p>
    <img src="cid:qrcode" alt="QR code" width="220" height="220" style="display:block;margin:0 auto 12px" />
    <p style="margin:0;font-family:monospace;font-size:16px;font-weight:bold">${escapeHtml(mail.registrationNumber)}</p>
    ${practical ? `<p style="margin:16px 0 0;color:#4b5563;font-size:14px">${practical}</p>` : ''}
    <p style="margin:20px 0 0;color:#6b7280;font-size:12px">Inscription 100 % gratuite. Le QR code est aussi joint en pièce jointe.</p>
  </div>
</div>`,
      attachments: [
        // Image intégrée au corps du message...
        {
          filename: `${mail.registrationNumber}.png`,
          content: base64,
          encoding: 'base64',
          cid: 'qrcode',
        },
        // ...et vraie pièce jointe, facile à enregistrer sur le téléphone.
        {
          filename: `QR-${mail.registrationNumber}.png`,
          content: base64,
          encoding: 'base64',
        },
      ],
    });
  }
}
