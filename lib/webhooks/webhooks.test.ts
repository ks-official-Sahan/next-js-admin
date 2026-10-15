import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { DeliveryJob, DeliveryOutcome } from "@/lib/data/webhooks";

import { deliverOne } from "./deliver";
import { MAX_ATTEMPTS, nextState, RETRY_DELAYS_MS } from "./policy";
import { newWebhookSecret, openSecret, sealSecret } from "./secret-box";
import { signWebhook, verifyWebhook } from "./signature";
import { isPublicAddress, resolvesPublic, webhookUrlProblem } from "./url-guard";

const MASTER = "m".repeat(48);

describe("signature", () => {
  test("verifies its own signature within the tolerance, and nothing else", () => {
    const header = signWebhook("whsec_a", '{"x":1}', 1_000);
    assert.equal(verifyWebhook("whsec_a", '{"x":1}', header, 1_100), true);
    assert.equal(verifyWebhook("whsec_b", '{"x":1}', header, 1_100), false);
    assert.equal(verifyWebhook("whsec_a", '{"x":2}', header, 1_100), false);
    assert.equal(verifyWebhook("whsec_a", '{"x":1}', header, 1_000 + 301), false);
    assert.equal(verifyWebhook("whsec_a", '{"x":1}', null, 1_000), false);
    assert.equal(verifyWebhook("whsec_a", '{"x":1}', "t=abc,v1=00", 1_000), false);
  });
});

describe("secret box", () => {
  test("round-trips, uses a fresh IV, and refuses another key or an altered cipher", () => {
    const secret = newWebhookSecret();
    assert.match(secret, /^whsec_[\w-]{43}$/);
    const a = sealSecret(secret, MASTER);
    assert.notEqual(a, sealSecret(secret, MASTER));
    assert.equal(openSecret(a, MASTER), secret);
    assert.throws(() => openSecret(a, "x".repeat(48)));
    const parts = a.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    assert.throws(() => openSecret(parts.join("."), MASTER));
  });
});

describe("url guard", () => {
  test("accepts public https URLs only", () => {
    assert.equal(webhookUrlProblem("https://hooks.example.com/in"), null);
    assert.ok(webhookUrlProblem("http://hooks.example.com/in"));
    assert.ok(webhookUrlProblem("https://user:pw@hooks.example.com"));
    assert.ok(webhookUrlProblem("https://localhost/x"));
    assert.ok(webhookUrlProblem("https://db.internal/x"));
    assert.ok(webhookUrlProblem("https://10.1.2.3/x"));
    assert.ok(webhookUrlProblem("https://[::1]/x"));
    assert.ok(webhookUrlProblem("not a url"));
  });

  test("classifies addresses, including IPv4-mapped IPv6", () => {
    for (const address of ["127.0.0.1", "169.254.169.254", "192.168.1.1", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "0.0.0.0"]) {
      assert.equal(isPublicAddress(address), false, address);
    }
    for (const address of ["8.8.8.8", "2606:4700::1111", "::ffff:8.8.8.8"]) {
      assert.equal(isPublicAddress(address), true, address);
    }
  });

  test("a host must resolve to public addresses only", async () => {
    assert.equal(await resolvesPublic("https://ok.example", async () => [{ address: "8.8.8.8" }]), true);
    assert.equal(await resolvesPublic("https://rebind.example", async () => [{ address: "8.8.8.8" }, { address: "10.0.0.5" }]), false);
    assert.equal(await resolvesPublic("https://none.example", async () => []), false);
  });
});

describe("retry policy", () => {
  test("delivered, scheduled, then failed after MAX_ATTEMPTS", () => {
    assert.deepEqual(nextState(1, true, 0), { status: "DELIVERED", nextAttemptAt: null });
    assert.equal(nextState(1, false, 0).nextAttemptAt?.getTime(), RETRY_DELAYS_MS[0]);
    assert.equal(nextState(MAX_ATTEMPTS - 1, false, 0).status, "PENDING");
    assert.deepEqual(nextState(MAX_ATTEMPTS, false, 0), { status: "FAILED", nextAttemptAt: null });
  });
});

describe("deliverOne", () => {
  const job = (over: Partial<DeliveryJob> = {}): DeliveryJob => ({
    id: "d1",
    event: "content.changed",
    payload: { id: "e1", type: "content.changed" },
    idempotencyKey: "e1:w1",
    status: "PENDING",
    attempts: 0,
    endpoint: { id: "w1", url: "https://hooks.example.com/in", secretCipher: sealSecret("whsec_s", MASTER), active: true },
    ...over,
  });

  function fakeRepo(claimable = true) {
    const finished: DeliveryOutcome[] = [];
    return {
      finished,
      repo: {
        async claim() {
          return claimable;
        },
        async finish(_id: string, outcome: DeliveryOutcome) {
          finished.push(outcome);
        },
      },
    };
  }
  const lookup = async () => [{ address: "93.184.216.34" }];

  test("sends a signed, idempotent POST without following redirects and records the success", async () => {
    const { repo, finished } = fakeRepo();
    let seen: { url: string; init: RequestInit } | null = null;
    const result = await deliverOne(job(), {
      repo,
      masterSecret: MASTER,
      lookup,
      now: () => 1_000_000,
      fetch: (async (url: string, init: RequestInit) => {
        seen = { url, init };
        return new Response(null, { status: 204 });
      }) as typeof fetch,
    });
    assert.equal(result.ok, true);
    assert.ok(seen);
    const { init } = seen as { url: string; init: RequestInit };
    const headers = init.headers as Record<string, string>;
    assert.equal(init.redirect, "manual");
    assert.equal(headers["Idempotency-Key"], "e1:w1");
    assert.equal(verifyWebhook("whsec_s", String(init.body), headers["X-Webhook-Signature"], 1_000), true);
    assert.equal(finished[0].status, "DELIVERED");
  });

  test("a redirect or error status is a failure scheduled for retry", async () => {
    const { repo, finished } = fakeRepo();
    const result = await deliverOne(job(), {
      repo,
      masterSecret: MASTER,
      lookup,
      fetch: (async () => new Response(null, { status: 302 })) as unknown as typeof fetch,
    });
    assert.equal(result.ok, false);
    assert.equal(finished[0].status, "PENDING");
    assert.equal(finished[0].responseStatus, 302);
  });

  test("never sends to a host that resolves privately", async () => {
    const { repo, finished } = fakeRepo();
    let called = false;
    await deliverOne(job(), {
      repo,
      masterSecret: MASTER,
      lookup: async () => [{ address: "127.0.0.1" }],
      fetch: (async () => {
        called = true;
        return new Response(null, { status: 200 });
      }) as unknown as typeof fetch,
    });
    assert.equal(called, false);
    assert.match(finished[0].lastError ?? "", /private/);
  });

  test("skips a delivery another worker claimed, and a delivered one", async () => {
    const taken = fakeRepo(false);
    assert.equal((await deliverOne(job(), { repo: taken.repo, masterSecret: MASTER })).skipped, true);
    assert.equal(taken.finished.length, 0);
    const done = fakeRepo();
    assert.equal((await deliverOne(job({ status: "DELIVERED" }), { repo: done.repo, masterSecret: MASTER })).skipped, true);
  });
});
