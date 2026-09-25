import assert from "node:assert/strict";
import { test } from "node:test";

import type { SmtpConfig } from "../config";
import type { PreparedMessage } from "../types";
import { createSmtpProvider, type SmtpTransport } from "./brevo-smtp";
import { capturedEmails, clearCapturedEmails, createCaptureProvider } from "./capture";
import { classifyResendError, createResendProvider, type ResendClient } from "./resend";

const message: PreparedMessage = {
  to: ["owner@example.com"],
  cc: [],
  bcc: [],
  subject: "Hello",
  html: "<p>Hi</p>",
  text: "Hi",
  category: "test",
};

const resendConfig = { apiKey: "re_test", from: '"Jordan" <noreply@example.com>' };
const smtpConfig: SmtpConfig = {
  host: "smtp.example.com",
  port: 587,
  secure: false,
  requireTLS: true,
  user: "u",
  pass: "p",
  from: "sender@example.com",
};

test("Resend: a successful send returns the message id and passes the fields through", async () => {
  let payload: Record<string, unknown> = {};
  const client: ResendClient = {
    emails: {
      send: async (input) => {
        payload = input as unknown as Record<string, unknown>;
        return { data: { id: "re-123" }, error: null };
      },
    },
  };
  const outcome = await createResendProvider(resendConfig, client).send({ ...message, replyTo: "r@example.com" });
  assert.deepEqual(outcome, { ok: true, messageId: "re-123" });
  assert.equal(payload.from, resendConfig.from);
  assert.deepEqual(payload.to, ["owner@example.com"]);
  assert.equal(payload.replyTo, "r@example.com");
  assert.equal("cc" in payload, false, "empty cc is not sent");
});

test("Resend: API errors are classified, and account or sender errors are retryable", async () => {
  const unverified = classifyResendError({ statusCode: 403, name: "validation_error" });
  assert.deepEqual([unverified.retryable, unverified.errorClass, unverified.status], [true, "resend_validation_error", 403]);
  assert.equal(classifyResendError({ statusCode: 500, name: "internal_server_error" }).retryable, true);
  assert.equal(classifyResendError({ statusCode: null, name: "application_error" }).retryable, true);
  assert.equal(classifyResendError({ statusCode: 429, name: "rate_limit_exceeded" }).retryable, true);
  assert.equal(classifyResendError({ statusCode: 401, name: "invalid_api_key" }).retryable, true);
  assert.equal(classifyResendError({ statusCode: 422, name: "invalid_parameter" }).retryable, false);
  assert.equal(classifyResendError({ statusCode: 400, name: "missing_required_field" }).retryable, false);
});

test("Resend: a thrown network error is a retryable transport failure", async () => {
  const client: ResendClient = {
    emails: {
      send: async () => {
        throw new Error("fetch failed");
      },
    },
  };
  assert.deepEqual(await createResendProvider(resendConfig, client).send(message), {
    ok: false,
    errorClass: "resend_transport",
    retryable: true,
  });
});

test("SMTP: a delivered message returns its id and passes cc, bcc and reply-to", async () => {
  let options: Record<string, unknown> = {};
  const transport: SmtpTransport = {
    sendMail: async (input) => {
      options = input as unknown as Record<string, unknown>;
      return { messageId: "<abc@example.com>", accepted: ["owner@example.com"], rejected: [] };
    },
  };
  const outcome = await createSmtpProvider(smtpConfig, transport).send({
    ...message,
    cc: ["c@example.com"],
    bcc: ["b@example.com"],
    replyTo: "r@example.com",
  });
  assert.deepEqual(outcome, { ok: true, messageId: "<abc@example.com>" });
  assert.equal(options.from, "sender@example.com");
  assert.deepEqual(options.cc, ["c@example.com"]);
  assert.deepEqual(options.bcc, ["b@example.com"]);
});

test("SMTP: every recipient rejected is a failure that another provider will not fix", async () => {
  const transport: SmtpTransport = {
    sendMail: async () => ({ accepted: [], rejected: ["owner@example.com"] }),
  };
  assert.deepEqual(await createSmtpProvider(smtpConfig, transport).send(message), {
    ok: false,
    errorClass: "smtp_rejected",
    retryable: false,
  });
});

test("SMTP: connection and authentication errors keep their code, never the message text", async () => {
  const transport: SmtpTransport = {
    sendMail: async () => {
      throw Object.assign(new Error("Invalid login: 535 secret-detail"), { code: "EAUTH", responseCode: 535 });
    },
  };
  const outcome = await createSmtpProvider(smtpConfig, transport).send(message);
  assert.deepEqual(outcome, { ok: false, errorClass: "smtp_EAUTH", retryable: true, status: 535 });
  assert.equal(JSON.stringify(outcome).includes("secret-detail"), false);
});

test("capture keeps messages outside production and refuses in production", async () => {
  clearCapturedEmails();
  const outcome = await createCaptureProvider(false).send(message);
  assert.deepEqual(outcome, { ok: true, messageId: "capture-1" });
  assert.equal(capturedEmails().length, 1);

  clearCapturedEmails();
  assert.deepEqual(await createCaptureProvider(true).send(message), {
    ok: false,
    errorClass: "capture_in_production",
    retryable: false,
  });
  assert.equal(capturedEmails().length, 0);
});
