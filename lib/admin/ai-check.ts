import type { ProviderCheck } from "@sahan-sac/ai-core/adapters";

// Turns an ai-core ProviderCheck into the one line the Integration health
// Check button shows. Pure, shared by the server action and its tests. Names
// providers and HTTP statuses only: a provider's error body never reaches it.

export interface AiCheckView {
  /** The provider answered (a cut-short or empty answer still proves the key and quota work). */
  reachable: boolean;
  message: string;
}

/** Answers that still prove the request reached a working model. */
const ANSWERED = new Set(["truncated", "empty_response", "refused"]);

function reason(errorClass: string | undefined): string {
  if (!errorClass) return "it failed";
  if (errorClass === "not_configured") return "it is not configured";
  if (errorClass === "no_provider") return "no provider is configured, or the configured ones are paid and AI_ALLOW_PAID is off";
  if (errorClass === "unknown_provider") return "the provider id is unknown";
  if (errorClass === "timeout" || errorClass === "aborted") return "it timed out";
  if (errorClass === "transport") return "the network request failed";
  if (errorClass === "paid_model_blocked") return "the configured model is paid and OPENROUTER_ALLOW_PAID_MODELS is off";
  if (errorClass === "http_401" || errorClass === "http_403") return `the key was refused (HTTP ${errorClass.slice(5)})`;
  if (errorClass === "http_402") return "the account is out of credit (HTTP 402)";
  if (errorClass === "http_429") return "it is rate limited or out of quota (HTTP 429)";
  if (errorClass.startsWith("http_")) return `the API answered HTTP ${errorClass.slice(5)}`;
  return errorClass.replace(/_/g, " ");
}

export function describeAiCheck(result: ProviderCheck, label: string): AiCheckView {
  const seconds = `${(result.ms / 1000).toFixed(1)} s`;
  const via = result.id.startsWith("chain:") && result.provider ? ` via ${result.provider}` : "";
  const fellThrough = (result.attempts ?? []).filter((attempt) => !attempt.ok).map((attempt) => attempt.provider);
  const after = fellThrough.length ? ` after ${fellThrough.join(", ")} failed` : "";
  if (result.ok) return { reachable: true, message: `${label} answered${via} in ${seconds}${after}.` };
  if (result.errorClass && ANSWERED.has(result.errorClass)) {
    return { reachable: true, message: `${label} is reachable${via} (${seconds}), though the test reply came back ${reason(result.errorClass)}.` };
  }
  return { reachable: false, message: `${label} did not answer: ${reason(result.errorClass)}.` };
}
