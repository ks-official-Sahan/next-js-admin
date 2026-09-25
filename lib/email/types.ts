// Shapes shared by the email service, its providers and the templates
// (design notes, step 5 and decision D11).

export const EMAIL_CATEGORIES = [
  "mfa",
  "security",
  "invite",
  "password-reset",
  "contact",
  "test",
] as const;

export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

export type ProviderName = "resend" | "brevo-smtp" | "capture";

/** What callers pass in. Addresses are bare (`name@example.com`). */
export interface EmailMessage {
  to: string | readonly string[];
  cc?: readonly string[];
  bcc?: readonly string[];
  subject: string;
  html: string;
  text: string;
  category: EmailCategory;
  replyTo?: string;
}

/** The same message after validation: arrays, trimmed, no header injection. */
export interface PreparedMessage {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  text: string;
  category: EmailCategory;
  replyTo?: string;
}

export type ProviderOutcome =
  | { ok: true; messageId?: string }
  | {
      ok: false;
      /** Short machine label, safe to store: `timeout`, `auth`, `sender`, `http_500`... */
      errorClass: string;
      /** True when trying the next provider can help. */
      retryable: boolean;
      status?: number;
    };

export interface EmailProvider {
  readonly name: ProviderName;
  send(message: PreparedMessage): Promise<ProviderOutcome>;
}

export interface Attempt {
  provider: ProviderName;
  ok: boolean;
  messageId?: string;
  errorClass?: string;
  status?: number;
  ms: number;
}

export interface SendResult {
  ok: boolean;
  /** The provider that delivered the message to its API or relay. */
  provider: ProviderName | null;
  messageId?: string;
  /** Set when nothing was attempted, for example a rejected message. */
  errorClass?: string;
  attempts: Attempt[];
}
