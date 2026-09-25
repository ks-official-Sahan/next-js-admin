import { Resend } from "resend";

import type { ResendConfig } from "../config";
import type { EmailProvider, PreparedMessage, ProviderOutcome } from "../types";

// Resend over its HTTPS API. The SDK does not throw for an API error, it returns
// { data, error }, so both shapes are mapped here.

interface ResendPayload {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}

export interface ResendClient {
  emails: {
    send(payload: ResendPayload): Promise<{
      data: { id: string } | null;
      error: { message: string; statusCode: number | null; name: string } | null;
    }>;
  };
}

/** Errors that concern the account or the sender, where another provider can still deliver. */
const ACCOUNT_LEVEL = new Set([
  "invalid_from_address",
  "missing_api_key",
  "invalid_api_key",
  "restricted_api_key",
  "invalid_access",
  "monthly_quota_exceeded",
  "daily_quota_exceeded",
  "rate_limit_exceeded",
  "security_error",
]);

export function classifyResendError(error: {
  statusCode: number | null;
  name: string;
}): Extract<ProviderOutcome, { ok: false }> {
  const status = error.statusCode ?? undefined;
  // 403 is what Resend answers for a sender domain that is not verified.
  const retryable =
    status === undefined || status >= 500 || status === 401 || status === 403 || status === 429 || ACCOUNT_LEVEL.has(error.name);
  return { ok: false, errorClass: `resend_${error.name}`, retryable, status };
}

export function createResendProvider(config: ResendConfig, client?: ResendClient): EmailProvider {
  const api: ResendClient = client ?? (new Resend(config.apiKey) as unknown as ResendClient);

  return {
    name: "resend",
    async send(message: PreparedMessage): Promise<ProviderOutcome> {
      try {
        const { data, error } = await api.emails.send({
          from: config.from,
          to: message.to,
          ...(message.cc.length ? { cc: message.cc } : {}),
          ...(message.bcc.length ? { bcc: message.bcc } : {}),
          ...(message.replyTo ? { replyTo: message.replyTo } : {}),
          subject: message.subject,
          html: message.html,
          text: message.text,
        });
        if (error) return classifyResendError(error);
        return { ok: true, messageId: data?.id };
      } catch {
        // Network failure, DNS, TLS: nothing reached Resend.
        return { ok: false, errorClass: "resend_transport", retryable: true };
      }
    },
  };
}
