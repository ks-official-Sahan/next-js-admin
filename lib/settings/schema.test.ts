import { test, describe } from "node:test";
import { strict as assert } from "node:assert";

import {
  DEFAULT_SETTINGS,
  SETTING_SCHEMAS,
  getSettingDefault,
  getSettingSchema,
  isPublicSetting,
  isSettingKey,
  publicSettingKeys,
  validateSetting,
  type SettingKey,
} from "./schema";

const ALL_KEYS = Object.keys(SETTING_SCHEMAS) as SettingKey[];

describe("setting keys", () => {
  test("isSettingKey recognizes every declared key and rejects unknown ones", () => {
    for (const key of ALL_KEYS) assert.equal(isSettingKey(key), true);
    assert.equal(isSettingKey("not.a.setting"), false);
    assert.equal(isSettingKey(""), false);
  });

  test("declares exactly the seven keys the design record lists", () => {
    assert.deepEqual(
      [...ALL_KEYS].sort(),
      [
        "chatbot.config",
        "email.routing",
        "features",
        "maintenance",
        "rbac.seedVersion",
        "security.ipAllowlist",
        "seo.llmsTxt",
      ].sort()
    );
  });
});

describe("defaults", () => {
  test("every key has a default, and it validates against its own schema", () => {
    for (const key of ALL_KEYS) {
      const value = getSettingDefault(key);
      assert.doesNotThrow(() => validateSetting(key, value));
    }
  });

  test("DEFAULT_SETTINGS has an entry for every key, matching getSettingDefault", () => {
    for (const key of ALL_KEYS) {
      assert.deepEqual(DEFAULT_SETTINGS[key], getSettingDefault(key));
    }
  });

  test("maintenance defaults to off", () => {
    const value = getSettingDefault("maintenance") as { enabled: boolean };
    assert.equal(value.enabled, false);
  });

  test("security.ipAllowlist defaults to off with an empty list", () => {
    const value = getSettingDefault("security.ipAllowlist") as { enabled: boolean; ips: string[] };
    assert.equal(value.enabled, false);
    assert.deepEqual(value.ips, []);
  });

  test("features defaults are all booleans", () => {
    const value = getSettingDefault("features") as Record<string, unknown>;
    for (const v of Object.values(value)) assert.equal(typeof v, "boolean");
  });
});

describe("validateSetting", () => {
  test("rejects a value that violates its schema", () => {
    assert.throws(() => validateSetting("maintenance", { enabled: "yes" }));
    assert.throws(() => validateSetting("chatbot.config", { tone: "sarcastic" }));
    assert.throws(() => validateSetting("email.routing", { inboxEmail: "not-an-email" }));
  });

  test("accepts a partial object and fills in defaults", () => {
    const value = validateSetting("features", {}) as Record<string, unknown>;
    assert.equal(typeof value.chatbotEnabled, "boolean");
  });

  test("security.ipAllowlist accepts a populated list", () => {
    const value = validateSetting("security.ipAllowlist", {
      enabled: true,
      ips: ["10.0.0.1", "2001:db8::/32"],
    }) as { enabled: boolean; ips: string[] };
    assert.equal(value.enabled, true);
    assert.deepEqual(value.ips, ["10.0.0.1", "2001:db8::/32"]);
  });
});

describe("getSettingSchema", () => {
  test("returns the schema instance registered for the key", () => {
    for (const key of ALL_KEYS) {
      assert.equal(getSettingSchema(key), SETTING_SCHEMAS[key]);
    }
  });
});

describe("public settings classification", () => {
  test("isPublicSetting matches the publicSettingKeys set exactly", () => {
    for (const key of ALL_KEYS) {
      assert.equal(isPublicSetting(key), publicSettingKeys.has(key));
    }
  });

  test("security.ipAllowlist, email.routing and rbac.seedVersion are never public", () => {
    assert.equal(isPublicSetting("security.ipAllowlist"), false);
    assert.equal(isPublicSetting("email.routing"), false);
    assert.equal(isPublicSetting("rbac.seedVersion"), false);
  });

  test("features, chatbot.config and maintenance are public", () => {
    assert.equal(isPublicSetting("features"), true);
    assert.equal(isPublicSetting("chatbot.config"), true);
    assert.equal(isPublicSetting("maintenance"), true);
  });
});
