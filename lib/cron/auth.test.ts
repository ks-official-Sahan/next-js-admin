import { test, describe } from "node:test";
import { strict as assert } from "node:assert";

import { isValidCronSecret } from "./auth";

describe("isValidCronSecret", () => {
  test("missing header is rejected", () => {
    assert.equal(isValidCronSecret(null, "topsecret"), false);
    assert.equal(isValidCronSecret(undefined, "topsecret"), false);
    assert.equal(isValidCronSecret("", "topsecret"), false);
  });

  test("wrong token is rejected", () => {
    assert.equal(isValidCronSecret("Bearer wrong", "topsecret"), false);
    assert.equal(isValidCronSecret("Bearer topsecret-extra", "topsecret"), false);
    assert.equal(isValidCronSecret("bearer topsecret", "topsecret"), false); // case sensitive
    assert.equal(isValidCronSecret("topsecret", "topsecret"), false); // missing "Bearer "
  });

  test("right token is accepted", () => {
    assert.equal(isValidCronSecret("Bearer topsecret", "topsecret"), true);
  });

  test("unconfigured secret never authorizes, even an empty header", () => {
    assert.equal(isValidCronSecret("Bearer ", undefined), false);
    assert.equal(isValidCronSecret("Bearer ", ""), false);
    assert.equal(isValidCronSecret(null, undefined), false);
  });

  test("different length values are rejected without throwing", () => {
    assert.doesNotThrow(() => isValidCronSecret("Bearer x", "a-much-longer-secret-value"));
    assert.equal(isValidCronSecret("Bearer x", "a-much-longer-secret-value"), false);
  });
});
