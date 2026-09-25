import assert from "node:assert/strict";
import { test } from "node:test";

import { brevoVerdict, runBrevoDiagnostics, type BrevoEvent, type SenderState } from "./brevo-diagnostics";

const goodSender: SenderState = {
  address: "sender@example.com",
  configured: true,
  verified: true,
  domain: "example.com",
  domainAuthenticated: true,
};

const event = (name: string, reason?: string): BrevoEvent => ({
  date: "2026-01-01T00:00:00Z",
  email: "owner@example.com",
  event: name,
  messageId: "<1@example.com>",
  reason,
});

const verdict = (overrides: Partial<Parameters<typeof brevoVerdict>[0]> = {}) =>
  brevoVerdict({
    apiKeyPresent: true,
    accountReachable: true,
    sender: goodSender,
    eventsQueried: true,
    events: [],
    ...overrides,
  }).code;

test("verdict: setup problems come before delivery events", () => {
  assert.equal(verdict({ apiKeyPresent: false }), "no_api_key");
  assert.equal(verdict({ accountReachable: false, accountStatus: 401 }), "api_key_rejected");
  assert.equal(verdict({ accountReachable: false, accountStatus: 403 }), "api_key_rejected");
  assert.equal(verdict({ accountReachable: false }), "unreachable");
  assert.equal(verdict({ sender: { ...goodSender, configured: false, address: null } }), "sender_not_verified");
  assert.equal(verdict({ sender: { ...goodSender, verified: false } }), "sender_not_verified");
  assert.equal(verdict({ sender: { ...goodSender, domainAuthenticated: false } }), "domain_not_authenticated");
  assert.equal(verdict({ sender: { ...goodSender, domainAuthenticated: null }, eventsQueried: false }), "ready");
});

test("verdict: message events decide the rest", () => {
  assert.equal(verdict({ events: [event("requests"), event("delivered")] }), "delivered");
  assert.equal(verdict({ events: [event("requests"), event("hardBounces", "mailbox does not exist")] }), "rejected");
  assert.equal(verdict({ events: [event("blocked")] }), "rejected");
  assert.equal(verdict({ events: [event("requests"), event("deferred")] }), "pending");
  assert.equal(verdict({ events: [] }), "no_events");
  assert.equal(verdict({ eventsQueried: false }), "ready");
});

test("verdict: a rejection carries the reason", () => {
  const result = brevoVerdict({
    apiKeyPresent: true,
    accountReachable: true,
    sender: goodSender,
    eventsQueried: true,
    events: [event("hardBounces", "mailbox does not exist")],
  });
  assert.match(result.message, /hardBounces: mailbox does not exist/);
});

function fakeFetch(routes: Record<string, { status: number; body?: unknown }>) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const impl = (async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init?.headers ?? {} });
    const path = url.replace("https://api.brevo.com/v3", "").split("?")[0];
    const route = routes[path] ?? { status: 404 };
    return { ok: route.status >= 200 && route.status < 300, status: route.status, json: async () => route.body };
  }) as unknown as typeof fetch;
  return { impl, calls };
}

test("a full run reads account, senders, domains and events, and reports delivery", async () => {
  const { impl, calls } = fakeFetch({
    "/account": { status: 200, body: { plan: [{ type: "free" }] } },
    "/senders": { status: 200, body: { senders: [{ email: "Sender@Example.com", active: true }] } },
    "/senders/domains": { status: 200, body: { domains: [{ domain_name: "example.com", authenticated: true }] } },
    "/smtp/statistics/events": { status: 200, body: { events: [{ ...event("delivered"), extra: "dropped" }] } },
  });
  const result = await runBrevoDiagnostics(
    { messageId: "<1@example.com>" },
    { apiKey: "xkeysib-secret", senderAddress: "sender@example.com", fetch: impl }
  );
  assert.equal(result.verdict.code, "delivered");
  assert.deepEqual(result.account, { reachable: true, plan: "free" });
  assert.deepEqual(result.sender, { ...goodSender });
  assert.equal(result.events.length, 1);
  assert.equal("extra" in result.events[0], false);
  assert.ok(calls.every((call) => call.headers["api-key"] === "xkeysib-secret"));
  assert.ok(calls.some((call) => call.url.includes("messageId=%3C1%40example.com%3E")));
  assert.equal(JSON.stringify(result).includes("xkeysib-secret"), false);
});

test("an unverified sender is reported even when the API itself works", async () => {
  const { impl } = fakeFetch({
    "/account": { status: 200, body: { plan: [] } },
    "/senders": { status: 200, body: { senders: [{ email: "other@example.com", active: true }] } },
    "/senders/domains": { status: 200, body: { domains: [] } },
  });
  const result = await runBrevoDiagnostics({}, { apiKey: "k", senderAddress: "sender@example.com", fetch: impl });
  assert.equal(result.verdict.code, "sender_not_verified");
  assert.equal(result.sender.domainAuthenticated, null);
});

test("a rejected key stops after the account call", async () => {
  const { impl, calls } = fakeFetch({ "/account": { status: 401 } });
  const result = await runBrevoDiagnostics({}, { apiKey: "bad", senderAddress: "sender@example.com", fetch: impl });
  assert.equal(result.verdict.code, "api_key_rejected");
  assert.equal(calls.length, 1);
  assert.deepEqual(result.notes, ["GET /account answered 401"]);
});

test("no key means no request at all, and a network failure is reported as unreachable", async () => {
  const { impl, calls } = fakeFetch({});
  const none = await runBrevoDiagnostics({}, { apiKey: undefined, senderAddress: null, fetch: impl });
  assert.equal(none.verdict.code, "no_api_key");
  assert.equal(calls.length, 0);

  const down = (async () => {
    throw new Error("network");
  }) as unknown as typeof fetch;
  const result = await runBrevoDiagnostics({}, { apiKey: "k", senderAddress: "a@b.cd", fetch: down });
  assert.equal(result.verdict.code, "unreachable");
});
