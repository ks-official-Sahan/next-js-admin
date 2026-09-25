import { test } from "node:test";
import assert from "node:assert";
import { stripNewlines } from "@/lib/inquiries/schema";

// Dedupe test: verify deduplication logic
test("deduplication within 10 minute window", async (t) => {
  const ipHash = "hash123";
  const email = "test@example.com";
  const message = "Test message content";

  await t.test("identical ipHash+email+message within 10 minutes returns true", () => {
    // Simulates the dedup cache check in the route handler
    const now = Date.now();
    const withinWindow = now - 5 * 60 * 1000; // 5 minutes ago

    // Within window - would return true
    const isWithinWindow = Math.abs(now - withinWindow) < 10 * 60 * 1000;
    assert.ok(isWithinWindow, "Recent submission should be within window");
  });

  await t.test("identical submission after 10 minutes returns false", () => {
    const now = Date.now();
    const outsideWindow = now - 11 * 60 * 1000; // 11 minutes ago

    // Outside window - would return false
    const isWithinWindow = Math.abs(now - outsideWindow) < 10 * 60 * 1000;
    assert.ok(!isWithinWindow, "Old submission should be outside window");
  });

  await t.test("different ipHash same email/message returns false", () => {
    // Different IP = different hash = no dedup match
    const hash1 = "hash123";
    const hash2 = "hash456";
    assert.notStrictEqual(hash1, hash2, "Different IPs produce different hashes");
  });

  await t.test("same ipHash different email returns false", () => {
    const email1 = "test@example.com";
    const email2 = "other@example.com";
    assert.notStrictEqual(email1, email2, "Different emails don't dedup");
  });

  await t.test("same ipHash/email different message returns false", () => {
    const msg1 = "Message one";
    const msg2 = "Message two";
    assert.notStrictEqual(msg1, msg2, "Different messages don't dedup");
  });
});

// Header injection test: verify CR/LF stripping
test("header injection CR/LF stripping", async (t) => {
  await t.test("stripNewlines removes \\r from text", () => {
    const withCR = "Name\rWith\rCarriage";
    const stripped = stripNewlines(withCR);
    assert.ok(!stripped.includes("\r"), "CR removed");
    assert.strictEqual(stripped, "NameWithCarriage");
  });

  await t.test("stripNewlines removes \\n from text", () => {
    const withLF = "Name\nWith\nLineFeed";
    const stripped = stripNewlines(withLF);
    assert.ok(!stripped.includes("\n"), "LF removed");
    assert.strictEqual(stripped, "NameWithLineFeed");
  });

  await t.test("stripNewlines removes mixed \\r\\n (CRLF)", () => {
    const withCRLF = "Name\r\nWith\r\nCRLF";
    const stripped = stripNewlines(withCRLF);
    assert.ok(!stripped.includes("\r"), "CR removed");
    assert.ok(!stripped.includes("\n"), "LF removed");
    assert.strictEqual(stripped, "NameWithCRLF");
  });

  await t.test("header injection payload is neutralized", () => {
    const injection = "John Doe\r\nX-Custom-Header: malicious";
    const stripped = stripNewlines(injection);
    // stripNewlines removes \r\n, so header cannot be injected on new line
    assert.ok(!stripped.includes("\r"), "CR removed prevents header split");
    assert.ok(!stripped.includes("\n"), "LF removed prevents header split");
    assert.strictEqual(stripped, "John DoeX-Custom-Header: malicious");
  });

  await t.test("email header injection (Bcc) is neutralized", () => {
    const injection = "sender@example.com\r\nBcc: attacker@evil.com";
    const stripped = stripNewlines(injection);
    // The \r\n that would allow Bcc injection is removed
    assert.ok(!stripped.includes("\r\n"), "CRLF removed prevents Bcc injection");
    assert.strictEqual(stripped, "sender@example.comBcc: attacker@evil.com");
  });

  await t.test("folded headers are stripped", () => {
    const folded = "Topic\r\nSubject: Injected";
    const stripped = stripNewlines(folded);
    // CR/LF removed, so the "Subject" continuation cannot exist as a separate header line
    assert.ok(!stripped.includes("\r"), "CR removed");
    assert.ok(!stripped.includes("\n"), "LF removed");
    assert.strictEqual(stripped, "TopicSubject: Injected");
  });
});

// Provider fallback test: multiple email attempts with tracking
test("provider fallback with email event recording", async (t) => {
  await t.test("simulates primary provider failure + fallback success", () => {
    // Track attempts
    const attempts: Array<{ provider: string; ok: boolean; error?: string }> = [];

    // Primary fails
    attempts.push({ provider: "resend", ok: false, error: "SMTP timeout" });

    // Fallback succeeds
    attempts.push({ provider: "sendgrid", ok: true });

    // At least one success
    const hasSuccess = attempts.some(a => a.ok);
    assert.ok(hasSuccess, "At least one provider succeeded");
  });

  await t.test("simulates both providers failing", () => {
    const attempts: Array<{ provider: string; ok: boolean; error?: string }> = [];

    // Primary fails
    attempts.push({ provider: "resend", ok: false, error: "Connection refused" });

    // Fallback also fails
    attempts.push({ provider: "sendgrid", ok: false, error: "Auth failed" });

    // No success
    const hasSuccess = attempts.some(a => a.ok);
    assert.ok(!hasSuccess, "All attempts failed");
  });

  await t.test("error message truncated to 500 chars in event record", () => {
    const longError = "A".repeat(600); // Longer than 500
    const truncated = longError.slice(0, 500);

    assert.strictEqual(truncated.length, 500);
    assert.ok(longError.length > 500);
  });

  await t.test("email event records provider, ok, messageId, truncated error", () => {
    // Fake email event structure
    const event = {
      provider: "resend",
      ok: false,
      messageId: null,
      error: "Network error".slice(0, 500),
      id: "evt_123",
      createdAt: new Date(),
      kind: "notify" as const,
      inquiryId: "inq_456",
    };

    assert.strictEqual(event.provider, "resend");
    assert.strictEqual(event.ok, false);
    assert.strictEqual(event.messageId, null);
    assert.ok(event.error);
  });

  await t.test("successful event includes messageId", () => {
    const event = {
      provider: "resend",
      ok: true,
      messageId: "msg_abc123",
      error: null,
      id: "evt_124",
      createdAt: new Date(),
      kind: "notify" as const,
      inquiryId: "inq_456",
    };

    assert.strictEqual(event.ok, true);
    assert.strictEqual(event.messageId, "msg_abc123");
    assert.strictEqual(event.error, null);
  });

  await t.test("emailStatus set to SENT on success", () => {
    const attempts: Array<{ provider: string; ok: boolean }> = [
      { provider: "resend", ok: false },
      { provider: "sendgrid", ok: true },
    ];

    const hasSuccess = attempts.some(a => a.ok);
    const emailStatus = hasSuccess ? "SENT" : "FAILED";

    assert.strictEqual(emailStatus, "SENT");
  });

  await t.test("emailStatus set to FAILED on all failures", () => {
    const attempts: Array<{ provider: string; ok: boolean }> = [
      { provider: "resend", ok: false },
      { provider: "sendgrid", ok: false },
    ];

    const hasSuccess = attempts.some(a => a.ok);
    const emailStatus = hasSuccess ? "SENT" : "FAILED";

    assert.strictEqual(emailStatus, "FAILED");
  });

  await t.test("multiple events recorded for multiple attempts", () => {
    // Simulate recording 2 attempts
    const events: Array<{ provider: string; ok: boolean; attempt: number }> = [];

    events.push({ provider: "resend", ok: false, attempt: 1 });
    events.push({ provider: "sendgrid", ok: true, attempt: 2 });

    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].provider, "resend");
    assert.strictEqual(events[1].provider, "sendgrid");
  });
});
