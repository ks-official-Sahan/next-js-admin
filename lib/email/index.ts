import "server-only";

import { auditSafe } from "@/lib/admin/audit";
import { getEnv } from "@/lib/env";

import { runBrevoDiagnostics, type BrevoDiagnostics, type DiagnosticsInput } from "./brevo-diagnostics";
import { emailConfigFromEnv, providerOrder, type EmailConfig } from "./config";
import { emailHealth, type EmailHealth } from "./health";
import { createSmtpProvider } from "./providers/brevo-smtp";
import { createCaptureProvider } from "./providers/capture";
import { createResendProvider } from "./providers/resend";
import { createEmailService, type SendOptions } from "./service";
import type { EmailMessage, EmailProvider, SendResult } from "./types";

// The one entry point for mail: sendEmail(). Resend first, Brevo SMTP second,
// chosen from the environment on every call, so a changed variable applies to the
// next send. design notes, step 5 and decision D11.

const isProduction = () => process.env.NODE_ENV === "production";

function currentConfig(): EmailConfig {
  return emailConfigFromEnv(getEnv());
}

function buildProviders(config: EmailConfig): EmailProvider[] {
  return providerOrder(config, isProduction()).flatMap((name): EmailProvider[] => {
    if (name === "resend" && config.resend) return [createResendProvider(config.resend)];
    if (name === "brevo-smtp" && config.smtp) return [createSmtpProvider(config.smtp)];
    if (name === "capture") return [createCaptureProvider(isProduction())];
    return [];
  });
}

/** Sends one message. Never throws for a delivery failure: read `ok` and `attempts`. */
export function sendEmail(message: EmailMessage, options?: SendOptions): Promise<SendResult> {
  return createEmailService({
    providers: buildProviders(currentConfig()),
    audit: (event) => auditSafe(event),
  }).send(message, options);
}

export function getEmailHealth(): EmailHealth {
  return emailHealth(currentConfig(), {
    production: isProduction(),
    brevoApiKey: Boolean(getEnv().EMAIL_BREVO_API_KEY),
  });
}

/** `"Name" <a@b.cd>` or `a@b.cd` to `a@b.cd`. */
const bareAddress = (mailbox: string | undefined) =>
  mailbox ? (/<([^<>]+)>$/.exec(mailbox)?.[1] ?? mailbox) : null;

export function getBrevoDiagnostics(input: DiagnosticsInput = {}): Promise<BrevoDiagnostics> {
  const env = getEnv();
  return runBrevoDiagnostics(input, {
    apiKey: env.EMAIL_BREVO_API_KEY,
    senderAddress: bareAddress(currentConfig().smtp?.from),
  });
}
