import type { AppEnv } from "@/lib/env";

import { assertMailbox, EmailGuardError } from "./guards";
import type { ProviderName } from "./types";

// Turns environment values into provider settings and decides the order in which
// providers are tried. Pure, so the rules are tested without touching the
// environment (design notes, step 5).

export type EmailEnv = Pick<
  AppEnv,
  | "EMAIL_PROVIDER"
  | "RESEND_API_KEY"
  | "RESEND_SENDER_EMAIL"
  | "RESEND_SENDER_NAME"
  | "EMAIL_HOST"
  | "EMAIL_PORT"
  | "EMAIL_USE_TLS"
  | "EMAIL_HOST_USER"
  | "EMAIL_HOST_PASSWORD"
  | "DEFAULT_FROM_EMAIL"
  | "EMAIL_SENDER_USER"
>;

export interface ResendConfig {
  apiKey: string;
  from: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  /** Implicit TLS (port 465). */
  secure: boolean;
  /** STARTTLS is mandatory (port 587 and other submission ports). */
  requireTLS: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface EmailConfig {
  mode: EmailEnv["EMAIL_PROVIDER"];
  resend: ResendConfig | null;
  smtp: SmtpConfig | null;
  /** Human readable reasons a provider is not usable. Never contains a secret. */
  problems: string[];
}

function mailbox(value: string, label: string, problems: string[]): string | null {
  try {
    return assertMailbox(value, label);
  } catch (error) {
    if (error instanceof EmailGuardError) {
      problems.push(`${label} is not a valid address`);
      return null;
    }
    throw error;
  }
}

export function emailConfigFromEnv(env: EmailEnv): EmailConfig {
  const problems: string[] = [];

  let resend: ResendConfig | null = null;
  if (env.RESEND_API_KEY && env.RESEND_SENDER_EMAIL) {
    const sender = env.RESEND_SENDER_NAME
      ? `${env.RESEND_SENDER_NAME} <${env.RESEND_SENDER_EMAIL}>`
      : env.RESEND_SENDER_EMAIL;
    const from = mailbox(sender, "RESEND_SENDER_EMAIL", problems);
    if (from) resend = { apiKey: env.RESEND_API_KEY, from };
  } else {
    problems.push("Resend needs RESEND_API_KEY and RESEND_SENDER_EMAIL");
  }

  let smtp: SmtpConfig | null = null;
  const fromValue = env.DEFAULT_FROM_EMAIL ?? env.EMAIL_SENDER_USER;
  if (env.EMAIL_HOST && env.EMAIL_HOST_USER && env.EMAIL_HOST_PASSWORD && fromValue) {
    const from = mailbox(fromValue, "DEFAULT_FROM_EMAIL", problems);
    const port = env.EMAIL_PORT ?? 587;
    const secure = port === 465;
    if (from) {
      smtp = {
        host: env.EMAIL_HOST,
        port,
        secure,
        requireTLS: !secure && env.EMAIL_USE_TLS,
        user: env.EMAIL_HOST_USER,
        pass: env.EMAIL_HOST_PASSWORD,
        from,
      };
    }
  } else {
    problems.push("SMTP needs EMAIL_HOST, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD and DEFAULT_FROM_EMAIL");
  }

  return { mode: env.EMAIL_PROVIDER, resend, smtp, problems };
}

/**
 * Providers to try, first to last. `auto` uses every configured provider, Resend
 * first. `capture` (tests) is never returned in production.
 */
export function providerOrder(config: EmailConfig, production: boolean): ProviderName[] {
  switch (config.mode) {
    case "resend":
      return config.resend ? ["resend"] : [];
    case "brevo-smtp":
      return config.smtp ? ["brevo-smtp"] : [];
    case "capture":
      return production ? [] : ["capture"];
    case "auto": {
      const order: ProviderName[] = [];
      if (config.resend) order.push("resend");
      if (config.smtp) order.push("brevo-smtp");
      return order;
    }
  }
}
