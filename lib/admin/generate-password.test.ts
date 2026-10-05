import assert from "node:assert/strict";
import { test } from "node:test";

import { checkPassword } from "@sahan-sac/auth-kit/password-policy";

import { GENERATED_PASSWORD_LENGTH, generatePassword } from "./generate-password";

test("generated passwords pass the password policy and have every character class", () => {
  for (let i = 0; i < 200; i++) {
    const password = generatePassword();
    assert.equal(password.length, GENERATED_PASSWORD_LENGTH);
    assert.ok(checkPassword(password).ok, password);
    assert.match(password, /[a-z]/);
    assert.match(password, /[A-Z]/);
    assert.match(password, /[0-9]/);
    assert.match(password, /[^a-zA-Z0-9]/);
    assert.doesNotMatch(password, /[0O1lI]/);
  }
});

test("generated passwords differ", () => {
  const seen = new Set(Array.from({ length: 100 }, () => generatePassword()));
  assert.equal(seen.size, 100);
});

test("rejected random draws are retried, never folded with a modulo", () => {
  // The first draw is above the unbiased limit for every alphabet size, so it must be discarded.
  const draws = [0xffff_ffff, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
  let index = 0;
  const random = (bytes: Uint32Array) => {
    bytes[0] = draws[Math.min(index++, draws.length - 1)];
    return bytes;
  };
  assert.equal(generatePassword(4, random).length, 4);
  assert.ok(index > 4);
});

test("length is bounded", () => {
  assert.throws(() => generatePassword(3), RangeError);
  assert.throws(() => generatePassword(129), RangeError);
  assert.equal(generatePassword(32).length, 32);
});
