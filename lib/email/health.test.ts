import assert from "node:assert/strict";
import { test } from "node:test";

import { emailConfigFromEnv, type EmailEnv } from "./config";
import { emailHealth } from "./health";

const env = (overrides: Partial<EmailEnv> = {}): EmailEnv => ({
  EMAIL_PROVIDER: "auto",
  RESEND_API_KEY: "re_secret_value",
  RESEND_SENDER_EMAIL: "noreply@example.com",
  RESEND_SENDER_NAME: undefined,
  EMAIL_HOST: "smtp.example.com",
  EMAIL_PORT: 587,
  EMAIL_USE_TLS: true,
  EMAIL_HOST_USER: "smtp-user",
  EMAIL_HOST_PASSWORD: "smtp_secret_value",
  DEFAULT_FROM_EMAIL: "sender@example.com",
  EMAIL_SENDER_USER: undefined,
  ...overrides,
});

const health = (overrides: Partial<EmailEnv> = {}, production = true, brevoApiKey = true) =>
  emailHealth(emailConfigFromEnv(env(overrides)), { production, brevoApiKey });

test("a healthy setup lists both providers in order and has nothing to report", () => {
  const result = health();
  assert.deepEqual(result.order, ["resend", "brevo-smtp"]);
  assert.equal(result.canSend, true);
  assert.deepEqual([result.problems, result.warnings], [[], []]);
  assert.deepEqual(result.smtp, { configured: true, host: "smtp.example.com", port: 587 });
});

test("the report never contains a secret", () => {
  const text = JSON.stringify(health());
  assert.equal(text.includes("re_secret_value"), false);
  assert.equal(text.includes("smtp_secret_value"), false);
  assert.equal(text.includes("smtp-user"), false);
});

test("a single provider works but is flagged as having no fallback", () => {
  const result = health({ RESEND_API_KEY: undefined });
  assert.deepEqual(result.order, ["brevo-smtp"]);
  assert.equal(result.canSend, true);
  assert.ok(result.warnings.some((warning) => warning.includes("no fallback")));
});

test("nothing usable is a problem", () => {
  const result = health({ RESEND_API_KEY: undefined, EMAIL_HOST: undefined });
  assert.equal(result.canSend, false);
  assert.equal(result.problems[0], "No email provider is usable, so no email can be sent.");
});

test("capture in production is called out, and a missing Brevo key is a warning", () => {
  const result = health({ EMAIL_PROVIDER: "capture" }, true, false);
  assert.equal(result.canSend, false);
  assert.ok(result.warnings.some((warning) => warning.includes("capture")));
  assert.ok(result.warnings.some((warning) => warning.includes("EMAIL_BREVO_API_KEY")));
  assert.equal(health({ EMAIL_PROVIDER: "capture" }, false).canSend, true);
});

test("problems about a provider that is not selected are left out", () => {
  const result = health({ EMAIL_PROVIDER: "resend", EMAIL_HOST: undefined });
  assert.deepEqual(result.problems, []);
});
