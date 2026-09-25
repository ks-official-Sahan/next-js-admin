import type { EmailProvider, PreparedMessage, ProviderOutcome } from "../types";

// Keeps messages in memory instead of sending them. For tests and local work;
// refused in production, so a misconfigured deployment cannot swallow real mail
// and report success (design notes, decision D11).

const captured: PreparedMessage[] = [];

export function capturedEmails(): readonly PreparedMessage[] {
  return captured;
}

export function clearCapturedEmails(): void {
  captured.length = 0;
}

export function createCaptureProvider(production: boolean): EmailProvider {
  return {
    name: "capture",
    async send(message: PreparedMessage): Promise<ProviderOutcome> {
      if (production) return { ok: false, errorClass: "capture_in_production", retryable: false };
      captured.push(message);
      return { ok: true, messageId: `capture-${captured.length}` };
    },
  };
}
