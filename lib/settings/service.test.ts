import { test, describe } from "node:test";
import { strict as assert } from "node:assert";

// No DATABASE_URL in the test environment, so every db.setting.findUnique()
// call inside readSettingRaw throws and is caught, falling back to defaults.
// That is exactly the "unconfigured database" path the service is written to
// tolerate, so it doubles as the fixture: collectPublicSettings/collectAllSettings
// run against defaults without a real database. cached()-wrapped entry points
// (getPublicSettings, getAllSettings) are not exercised here: unstable_cache
// requires a Next.js request scope this test runner does not provide.

import { collectAllSettings, collectPublicSettings } from "./service";
import { DEFAULT_SETTINGS, isPublicSetting, type SettingKey } from "./schema";

describe("collectPublicSettings", () => {
  test("contains only keys classified public", async () => {
    const result = await collectPublicSettings();
    for (const key of Object.keys(result) as SettingKey[]) {
      assert.equal(isPublicSetting(key), true, `${key} should not be in public settings`);
    }
  });

  test("never contains security.ipAllowlist, email.routing or rbac.seedVersion", async () => {
    const result = await collectPublicSettings();
    assert.equal("security.ipAllowlist" in result, false);
    assert.equal("email.routing" in result, false);
    assert.equal("rbac.seedVersion" in result, false);
  });

  test("contains every public key with a defined value", async () => {
    const result = await collectPublicSettings();
    assert.equal("features" in result, true);
    assert.equal("chatbot.config" in result, true);
    assert.equal("maintenance" in result, true);
    for (const value of Object.values(result)) assert.notEqual(value, undefined);
  });
});

describe("collectAllSettings", () => {
  test("contains every declared setting key", async () => {
    const result = await collectAllSettings();
    assert.deepEqual(Object.keys(result).sort(), Object.keys(DEFAULT_SETTINGS).sort());
  });

  test("falls back to defaults when the database is unreachable", async () => {
    const result = await collectAllSettings();
    const maintenance = result["maintenance"] as { enabled: boolean };
    assert.equal(maintenance.enabled, false);
  });
});
