import nodemailer from "nodemailer";

import type { SmtpConfig } from "../config";
import type { EmailProvider, PreparedMessage, ProviderOutcome } from "../types";

// Brevo's SMTP relay through nodemailer. Port 587 must upgrade with STARTTLS
// (`requireTLS`), port 465 is TLS from the first byte (`secure`). SMTP delivered
// where Brevo's HTTP API accepted mail without delivering it (risk R9), so this
// is the reliable fallback.

interface SmtpInfo {
  messageId?: string;
  accepted?: unknown[];
  rejected?: unknown[];
}

export interface SmtpTransport {
  sendMail(options: {
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    replyTo?: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<SmtpInfo>;
}

export function createSmtpProvider(config: SmtpConfig, transport?: SmtpTransport): EmailProvider {
  const mailer: SmtpTransport =
    transport ??
    (nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: config.requireTLS,
      auth: { user: config.user, pass: config.pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    }) as unknown as SmtpTransport);

  return {
    name: "brevo-smtp",
    async send(message: PreparedMessage): Promise<ProviderOutcome> {
      try {
        const info = await mailer.sendMail({
          from: config.from,
          to: message.to,
          ...(message.cc.length ? { cc: message.cc } : {}),
          ...(message.bcc.length ? { bcc: message.bcc } : {}),
          ...(message.replyTo ? { replyTo: message.replyTo } : {}),
          subject: message.subject,
          html: message.html,
          text: message.text,
        });
        if ((info.accepted?.length ?? 0) === 0 && (info.rejected?.length ?? 0) > 0) {
          return { ok: false, errorClass: "smtp_rejected", retryable: false };
        }
        return { ok: true, messageId: info.messageId };
      } catch (error) {
        const { code, responseCode } = error as { code?: string; responseCode?: number };
        return {
          ok: false,
          errorClass: `smtp_${code ?? responseCode ?? "error"}`,
          retryable: true,
          status: responseCode,
        };
      }
    },
  };
}
