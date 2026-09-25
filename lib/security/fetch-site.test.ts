import { test, describe } from "node:test";
import { strict as assert } from "node:assert";

import { isCrossSiteFetch } from "./fetch-site";

describe("isCrossSiteFetch", () => {
  test("refuses cross-site", () => {
    assert.equal(isCrossSiteFetch("cross-site"), true);
  });

  test("allows same-origin, same-site and none", () => {
    assert.equal(isCrossSiteFetch("same-origin"), false);
    assert.equal(isCrossSiteFetch("same-site"), false);
    assert.equal(isCrossSiteFetch("none"), false);
  });

  test("allows a missing header (fail open for non-browser or very old clients)", () => {
    assert.equal(isCrossSiteFetch(null), false);
    assert.equal(isCrossSiteFetch(undefined), false);
  });
});
