import { createHmac } from "node:crypto";

import { constantTimeEqual } from "@sahan-sac/auth-kit/login-unlock";

// The signature every delivery carries: `X-Webhook-Signature: t=<unix seconds>,v1=<hex>`,
// where v1 is HMAC-SHA256 of `${t}.${body}` with the endpoint's secret. The
// timestamp is signed too, so a captured request cannot be replayed later
// than SIGNATURE_TOLERANCE_S. docs/headless-api.md shows a consumer's check.

export const SIGNATURE_HEADER = "X-Webhook-Signature";
export const SIGNATURE_TOLERANCE_S = 300;

function hmac(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

export function signWebhook(secret: string, body: string, timestampS: number): string {
  return `t=${timestampS},v1=${hmac(secret, `${timestampS}.${body}`)}`;
}

/** What a consumer runs: a valid signature, made within the tolerance. */
export function verifyWebhook(secret: string, body: string, header: string | null, nowS = Math.floor(Date.now() / 1000)): boolean {
  if (!header) return false;
  const parts = new Map(header.split(",").map((part) => part.trim().split("=", 2) as [string, string]));
  const t = Number(parts.get("t"));
  const v1 = parts.get("v1");
  if (!Number.isInteger(t) || !v1 || Math.abs(nowS - t) > SIGNATURE_TOLERANCE_S) return false;
  return constantTimeEqual(v1, hmac(secret, `${t}.${body}`));
}
