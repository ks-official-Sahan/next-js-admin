import { providerOrder, type EmailConfig } from "./config";
import type { ProviderName } from "./types";

// What the settings screen shows about email: which providers are usable and in
// what order, and what is wrong. No secret and no key ever appears here, only
// whether it is set.

export interface EmailHealth {
  mode: EmailConfig["mode"];
  order: ProviderName[];
  canSend: boolean;
  resend: { configured: boolean; from: string | null };
  smtp: { configured: boolean; host: string | null; port: number | null };
  brevoApiKey: boolean;
  problems: string[];
  warnings: string[];
}

export function emailHealth(
  config: EmailConfig,
  options: { production: boolean; brevoApiKey: boolean }
): EmailHealth {
  const order = providerOrder(config, options.production);
  const warnings: string[] = [];

  if (config.mode === "capture" && options.production) {
    warnings.push("EMAIL_PROVIDER=capture is refused in production, so no mail is sent.");
  }
  if (config.mode === "auto" && order.length === 1) {
    warnings.push(`Only ${order[0]} is configured, so there is no fallback if it fails.`);
  }
  if (!options.brevoApiKey) {
    warnings.push("EMAIL_BREVO_API_KEY is not set, so Brevo delivery diagnostics are unavailable.");
  }

  // "Resend needs ..." style notes only matter for a provider that is in use or expected.
  const problems = config.problems.filter((problem) => {
    if (config.mode === "resend") return !problem.startsWith("SMTP");
    if (config.mode === "brevo-smtp") return !problem.startsWith("Resend");
    if (config.mode === "capture") return false;
    return true;
  });
  if (order.length === 0) problems.unshift("No email provider is usable, so no email can be sent.");

  return {
    mode: config.mode,
    order,
    canSend: order.length > 0,
    resend: { configured: config.resend !== null, from: config.resend?.from ?? null },
    smtp: {
      configured: config.smtp !== null,
      host: config.smtp?.host ?? null,
      port: config.smtp?.port ?? null,
    },
    brevoApiKey: options.brevoApiKey,
    problems,
    warnings,
  };
}
