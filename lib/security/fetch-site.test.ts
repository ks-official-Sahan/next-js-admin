import { test, describe } from "node:test";
import { strict as assert } from "node:assert";

import { isCrossSiteFetch, isSameOriginOrDirect } from "./fetch-site";

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

describe("isSameOriginOrDirect", () => {
  test("allows the same origin, a typed URL and a missing header", () => {
    for (const header of ["same-origin", "none", null, undefined]) assert.equal(isSameOriginOrDirect(header), true, String(header));
  });

  test("refuses a sibling subdomain and another site", () => {
    assert.equal(isSameOriginOrDirect("same-site"), false);
    assert.equal(isSameOriginOrDirect("cross-site"), false);
  });
});
