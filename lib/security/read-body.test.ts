import assert from "node:assert/strict";
import { test } from "node:test";

import { readBodyText } from "./read-body";

const post = (body: BodyInit | null, headers: Record<string, string> = {}) => new Request("https://example.com/api", { method: "POST", body, headers, duplex: "half" } as RequestInit);

function stream(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let pulled = 0;
  return new ReadableStream({
    pull(controller) {
      if (pulled < parts.length) controller.enqueue(encoder.encode(parts[pulled++]));
      else controller.close();
    },
  });
}

test("a body within the limit reads back as text, multi-byte characters included", async () => {
  assert.equal(await readBodyText(post('{"q":"héllo"}'), 64), '{"q":"héllo"}');
  assert.equal(await readBodyText(post(null), 64), "");
});

test("a declared Content-Length over the limit is refused without reading", async () => {
  assert.equal(await readBodyText(post("{}", { "content-length": "999999" }), 64), null);
});

test("a streamed body stops at the first chunk past the limit", async () => {
  let pulled = 0;
  const parts = ["a".repeat(40), "b".repeat(40), "c".repeat(40)];
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled < parts.length) controller.enqueue(new TextEncoder().encode(parts[pulled++]));
      else controller.close();
    },
  });
  assert.equal(await readBodyText(post(body), 64), null);
  assert.ok(pulled < parts.length, "the rest of the body is never read");
  assert.equal(await readBodyText(post(stream(["ab", "cd"])), 4), "abcd", "exactly the limit is allowed");
});
