import { test, describe } from "node:test";
import { strict as assert } from "node:assert";

import { jsonLdHtml } from "./json-ld";

describe("jsonLdHtml", () => {
  test("escapes every '<' so a value can never close the script tag early", () => {
    const html = jsonLdHtml({ name: "</script><script>alert(1)</script>" });
    assert.equal(html.includes("<"), false);
    assert.match(html, /\\u003cscript\\u003e/);
  });

  test("round-trips through JSON.parse once the escape is reversed", () => {
    const data = { a: 1, b: "<b>", c: [1, 2, 3] };
    const html = jsonLdHtml(data);
    const parsed = JSON.parse(html.replace(/\\u003c/g, "<"));
    assert.deepEqual(parsed, data);
  });

  test("leaves ordinary content unchanged besides the escape", () => {
    assert.equal(jsonLdHtml({ a: 1 }), JSON.stringify({ a: 1 }));
  });
});
