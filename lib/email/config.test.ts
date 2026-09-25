import assert from "node:assert/strict";
import { test } from "node:test";

import { emailConfigFromEnv, providerOrder, type EmailEnv } from "./config";

const env = (overrides: Partial<EmailEnv> = {}): EmailEnv => ({
  EMAIL_PROVIDER: "auto",
  RESEND_API_KEY: "re_test_key",
  RESEND_SENDER_EMAIL: "noreply@example.com",
  RESEND_SENDER_NAME: "Jordan",
  EMAIL_HOST: "smtp.example.com",
  EMAIL_PORT: 587,
  EMAIL_USE_TLS: true,
  EMAIL_HOST_USER: "smtp-user",
  EMAIL_HOST_PASSWORD: "smtp-pass",
  DEFAULT_FROM_EMAIL: "Jordan <sender@example.com>",
  EMAIL_SENDER_USER: undefined,
  ...overrides,
});

test("both providers configured: auto tries Resend, then SMTP", () => {
  const config = emailConfigFromEnv(env());
  assert.equal(config.resend?.from, '"Jordan" <noreply@example.com>');
  assert.equal(config.smtp?.from, '"Jordan" <sender@example.com>');
  assert.deepEqual(providerOrder(config, true), ["resend", "brevo-smtp"]);
  assert.deepEqual(config.problems, []);
});

test("port 587 uses STARTTLS and port 465 uses implicit TLS", () => {
  const submission = emailConfigFromEnv(env({ EMAIL_PORT: 587 })).smtp;
  assert.equal(submission?.secure, false);
  assert.equal(submission?.requireTLS, true);
  const implicit = emailConfigFromEnv(env({ EMAIL_PORT: 465 })).smtp;
  assert.equal(implicit?.secure, true);
  assert.equal(implicit?.requireTLS, false);
  assert.equal(emailConfigFromEnv(env({ EMAIL_PORT: undefined })).smtp?.port, 587);
  assert.equal(emailConfigFromEnv(env({ EMAIL_USE_TLS: false })).smtp?.requireTLS, false);
});

test("the SMTP sender falls back to EMAIL_SENDER_USER", () => {
  const config = emailConfigFromEnv(env({ DEFAULT_FROM_EMAIL: undefined, EMAIL_SENDER_USER: "fallback@example.com" }));
  assert.equal(config.smtp?.from, "fallback@example.com");
});

test("an explicit provider setting selects only that provider", () => {
  assert.deepEqual(providerOrder(emailConfigFromEnv(env({ EMAIL_PROVIDER: "resend" })), true), ["resend"]);
  assert.deepEqual(providerOrder(emailConfigFromEnv(env({ EMAIL_PROVIDER: "brevo-smtp" })), true), ["brevo-smtp"]);
});

test("a provider that is not configured is skipped, and the reason is reported", () => {
  const config = emailConfigFromEnv(env({ RESEND_API_KEY: undefined }));
  assert.deepEqual(providerOrder(config, true), ["brevo-smtp"]);
  assert.ok(config.problems.some((problem) => problem.startsWith("Resend needs")));
  assert.deepEqual(providerOrder(emailConfigFromEnv(env({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: undefined })), true), []);
});

test("an invalid sender address disables that provider without leaking values", () => {
  const config = emailConfigFromEnv(env({ RESEND_SENDER_EMAIL: "not-an-address" }));
  assert.equal(config.resend, null);
  assert.ok(config.problems.includes("RESEND_SENDER_EMAIL is not a valid address"));
  assert.equal(JSON.stringify(config.problems).includes("not-an-address"), false);
});

test("capture is available outside production and refused in production", () => {
  const config = emailConfigFromEnv(env({ EMAIL_PROVIDER: "capture" }));
  assert.deepEqual(providerOrder(config, false), ["capture"]);
  assert.deepEqual(providerOrder(config, true), []);
});

test("nothing configured gives no provider", () => {
  const config = emailConfigFromEnv(
    env({ RESEND_API_KEY: undefined, EMAIL_HOST: undefined, EMAIL_HOST_USER: undefined })
  );
  assert.deepEqual(providerOrder(config, true), []);
});
