import assert from "node:assert/strict";
import { test } from "node:test";

import type { AuditEvent } from "../admin/audit";
import { createEmailService } from "./service";
import type { EmailMessage, EmailProvider, ProviderName, ProviderOutcome } from "./types";

const message: EmailMessage = {
  to: "owner@example.com",
  subject: "Sign-in code",
  html: "<p>secret-body-123456</p>",
  text: "secret-body-123456",
  category: "mfa",
};

function provider(name: ProviderName, outcome: ProviderOutcome | (() => Promise<ProviderOutcome>)) {
  const calls: number[] = [];
  const fake: EmailProvider = {
    name,
    send: async () => {
      calls.push(1);
      return typeof outcome === "function" ? outcome() : outcome;
    },
  };
  return { fake, calls };
}

function service(providers: EmailProvider[], timeoutMs = 50) {
  const audits: AuditEvent[] = [];
  const svc = createEmailService({
    providers,
    timeoutMs,
    audit: async (event) => void audits.push(event),
  });
  return { svc, audits };
}

test("the first provider that delivers ends the run", async () => {
  const first = provider("resend", { ok: true, messageId: "re-1" });
  const second = provider("brevo-smtp", { ok: true, messageId: "smtp-1" });
  const { svc, audits } = service([first.fake, second.fake]);
  const result = await svc.send(message);
  assert.equal(result.ok, true);
  assert.equal(result.provider, "resend");
  assert.equal(result.messageId, "re-1");
  assert.equal(second.calls.length, 0);
  assert.equal(audits[0].action, "email.sent");
});

test("a retryable failure moves on to the next provider", async () => {
  const first = provider("resend", { ok: false, errorClass: "resend_validation_error", retryable: true, status: 403 });
  const second = provider("brevo-smtp", { ok: true, messageId: "smtp-1" });
  const { svc } = service([first.fake, second.fake]);
  const result = await svc.send(message);
  assert.equal(result.provider, "brevo-smtp");
  assert.deepEqual(
    result.attempts.map((attempt) => [attempt.provider, attempt.ok, attempt.errorClass]),
    [
      ["resend", false, "resend_validation_error"],
      ["brevo-smtp", true, undefined],
    ]
  );
});

test("a failure about the message itself stops the run", async () => {
  const first = provider("resend", { ok: false, errorClass: "resend_invalid_parameter", retryable: false, status: 422 });
  const second = provider("brevo-smtp", { ok: true });
  const { svc, audits } = service([first.fake, second.fake]);
  const result = await svc.send(message);
  assert.equal(result.ok, false);
  assert.equal(result.errorClass, "resend_invalid_parameter");
  assert.equal(second.calls.length, 0);
  assert.equal(audits[0].action, "email.failed");
});

test("a provider that hangs times out and the next one is tried", async () => {
  const slow = provider("resend", () => new Promise<ProviderOutcome>(() => undefined));
  const second = provider("brevo-smtp", { ok: true, messageId: "smtp-1" });
  const { svc } = service([slow.fake, second.fake], 20);
  const result = await svc.send(message);
  assert.equal(result.provider, "brevo-smtp");
  assert.equal(result.attempts[0].errorClass, "timeout");
});

test("a provider that throws is treated as a transport failure", async () => {
  const broken = provider("resend", async () => {
    throw new Error("boom");
  });
  const second = provider("brevo-smtp", { ok: true });
  const { svc } = service([broken.fake, second.fake]);
  const result = await svc.send(message);
  assert.equal(result.ok, true);
  assert.equal(result.attempts[0].errorClass, "transport");
});

test("every provider failing reports the last error class", async () => {
  const a = provider("resend", { ok: false, errorClass: "resend_transport", retryable: true });
  const b = provider("brevo-smtp", { ok: false, errorClass: "smtp_EAUTH", retryable: true });
  const { svc } = service([a.fake, b.fake]);
  const result = await svc.send(message);
  assert.equal(result.ok, false);
  assert.equal(result.provider, null);
  assert.equal(result.errorClass, "smtp_EAUTH");
  assert.equal(result.attempts.length, 2);
});

test("no provider configured is reported, not thrown", async () => {
  const { svc, audits } = service([]);
  const result = await svc.send(message);
  assert.deepEqual([result.ok, result.errorClass], [false, "no_provider"]);
  assert.equal(audits[0].action, "email.failed");
});

test("a hostile message is rejected before any provider runs", async () => {
  const only = provider("resend", { ok: true });
  const { svc } = service([only.fake]);
  const result = await svc.send({ ...message, subject: "Hi\nBcc: evil@example.com" });
  assert.deepEqual([result.ok, result.errorClass], [false, "header_injection"]);
  assert.equal(only.calls.length, 0);
});

test("the audit row holds provider, id and counts but never the body or an address", async () => {
  const only = provider("resend", { ok: true, messageId: "re-9" });
  const { svc, audits } = service([only.fake]);
  await svc.send({ ...message, cc: ["cc@example.com"] }, { actor: { id: "u1", email: "owner@example.com" } });
  const row = audits[0];
  assert.equal(row.entityType, "Email");
  assert.deepEqual(row.actor, { id: "u1", email: "owner@example.com" });
  const meta = row.meta as { category: string; provider: string; messageId: string; recipients: number };
  assert.deepEqual([meta.category, meta.provider, meta.messageId, meta.recipients], ["mfa", "resend", "re-9", 2]);
  const text = JSON.stringify(row.meta);
  assert.equal(text.includes("secret-body"), false);
  assert.equal(text.includes("@example.com"), false);
});

test("a failing audit write does not change the result", async () => {
  const only = provider("resend", { ok: true });
  const svc = createEmailService({
    providers: [only.fake],
    audit: async () => {
      throw new Error("db down");
    },
  });
  assert.equal((await svc.send(message)).ok, true);
});
