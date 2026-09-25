import assert from "node:assert/strict";
import { test } from "node:test";

import { csvCell, toCsv } from "./csv";

test("plain values pass through and empty ones are empty", () => {
  assert.equal(csvCell("hello"), "hello");
  assert.equal(csvCell(42), "42");
  assert.equal(csvCell(true), "true");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
});

test("commas, quotes and line breaks are quoted and quotes doubled", () => {
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
  assert.equal(csvCell("a\r\nb"), '"a\r\nb"');
});

test("a text cell that starts like a formula is neutralised", () => {
  for (const attack of ["=1+1", "+cmd", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"]) {
    assert.ok(csvCell(attack).replace(/^"/, "").startsWith("'"), attack);
  }
  assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
});

test("numbers, including negative ones, are not touched", () => {
  assert.equal(csvCell(-5), "-5");
  assert.equal(csvCell(0), "0");
});

test("dates are ISO strings and objects are JSON", () => {
  assert.equal(csvCell(new Date("2026-01-02T03:04:05.000Z")), "2026-01-02T03:04:05.000Z");
  assert.equal(csvCell({ a: 1 }), '"{""a"":1}"');
});

test("toCsv writes a header and CRLF rows", () => {
  assert.equal(toCsv(["a", "b"], [[1, "x,y"], [null, "=z"]]), 'a,b\r\n1,"x,y"\r\n,\'=z\r\n');
  assert.equal(toCsv(["only"], []), "only\r\n");
});
