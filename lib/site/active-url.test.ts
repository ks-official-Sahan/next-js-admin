import { strict as assert } from "node:assert";
import { test } from "node:test";

import { createActiveUrlResolver, HEALTH_SERVICE, probeOrigin, siteUrlCandidates } from "./active-url";

const COM = "https://example.com";
const APP = "https://example.vercel.app";

test("candidates: SITE_URLS wins, else SITE_URL then the defaults; origins only, no repeats", () => {
  assert.deepEqual(siteUrlCandidates({}, [COM, APP]), [COM, APP]);
  assert.deepEqual(siteUrlCandidates({ SITE_URL: `${COM}/` }, [COM, APP]), [COM, APP]);
  assert.deepEqual(siteUrlCandidates({ SITE_URL: "https://staging.example" }, [COM, APP]), ["https://staging.example", COM, APP]);
  assert.deepEqual(siteUrlCandidates({ SITE_URLS: [`${APP}/x`, "ftp://bad", "not a url", APP], SITE_URL: COM }, [COM]), [APP]);
});

const respond = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

test("probe: healthy only with this app's marker; other answers below 500 are reachable; the rest down", async () => {
  assert.equal(await probeOrigin(COM, { fetch: respond(200, { ok: true, service: HEALTH_SERVICE }) as typeof fetch }), "healthy");
  assert.equal(await probeOrigin(COM, { fetch: respond(200, { ok: true }) as typeof fetch }), "reachable");
  assert.equal(await probeOrigin(COM, { fetch: respond(404, {}) as typeof fetch }), "reachable");
  assert.equal(await probeOrigin(COM, { fetch: (async () => new Response("<html>parked</html>")) as typeof fetch }), "reachable");
  assert.equal(await probeOrigin(COM, { fetch: respond(503, { ok: true, service: HEALTH_SERVICE }) as typeof fetch }), "down");
  assert.equal(await probeOrigin(COM, { fetch: (async () => { throw new TypeError("fetch failed"); }) as typeof fetch }), "down");
});

test("resolver: the first healthy domain in order, cached, one probe for concurrent callers", async () => {
  let probes = 0;
  let clock = 0;
  const up = new Set([APP]);
  const resolver = createActiveUrlResolver({
    candidates: [COM, APP],
    probe: async (origin) => {
      probes += 1;
      return up.has(origin) ? "healthy" : "down";
    },
    now: () => clock,
  });
  const [a, b] = await Promise.all([resolver.resolve(), resolver.resolve()]);
  assert.equal(a, APP);
  assert.equal(b, APP);
  assert.equal(probes, 2); // both candidates, once

  up.add(COM);
  assert.equal(await resolver.resolve(), APP); // still cached
  clock += 301_000;
  assert.equal(await resolver.resolve(), COM); // the first one is back
});

test("resolver: none answering falls back to the first, briefly; a shared answer skips probing", async () => {
  let clock = 0;
  const stored: { value?: string; ttl?: number } = {};
  const resolver = createActiveUrlResolver({
    candidates: [COM, APP],
    probe: async () => "down",
    now: () => clock,
    shared: {
      get: async () => null,
      set: async (value, ttl) => {
        stored.value = value;
        stored.ttl = ttl;
      },
    },
  });
  assert.equal(await resolver.resolve(), COM);
  assert.deepEqual(stored, { value: COM, ttl: 60 });

  const fromShared = createActiveUrlResolver({
    candidates: [COM, APP],
    probe: async () => {
      throw new Error("must not probe");
    },
    shared: { get: async () => APP, set: async () => undefined },
  });
  assert.equal(await fromShared.resolve(), APP);

  const single = createActiveUrlResolver({ candidates: [COM], probe: async () => "down" });
  assert.equal(await single.resolve(), COM);
});

test("resolver: with nothing healthy, a domain that answers beats one that does not resolve", async () => {
  // Today: the custom domain has no DNS, the Vercel domain runs a build without /api/health.
  const resolver = createActiveUrlResolver({
    candidates: [COM, APP],
    probe: async (origin) => (origin === APP ? "reachable" : "down"),
  });
  assert.equal(await resolver.resolve(), APP);
  // A healthy domain still wins over an earlier one that merely answers.
  const both = createActiveUrlResolver({
    candidates: [COM, APP],
    probe: async (origin) => (origin === APP ? "healthy" : "reachable"),
  });
  assert.equal(await both.resolve(), APP);
});
