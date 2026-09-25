import { test } from "node:test";
import assert from "node:assert";

import { scoreSpam, SPAM_THRESHOLD } from "./spam";

test("spam scoring", async (t) => {
  await t.test("disposable email domain increases score", () => {
    const legitimate = scoreSpam({
      email: "user@gmail.com",
      message: "I have a question about your services.",
    });
    const disposable = scoreSpam({
      email: "user@tempmail.com",
      message: "I have a question about your services.",
    });
    assert.ok(disposable > legitimate, "Disposable domain should score higher");
    assert.ok(disposable >= 40, "Disposable domain should add at least 40 points");
  });

  await t.test("excessive URLs increase score", () => {
    const noLinks = scoreSpam({
      email: "user@example.com",
      message: "I have a legitimate question.",
    });
    const manyLinks = scoreSpam({
      email: "user@example.com",
      message:
        "Check these links: http://a.com http://b.com http://c.com http://d.com http://e.com",
    });
    assert.ok(manyLinks > noLinks, "Many URLs should score higher");
  });

  await t.test("repeated characters increase score", () => {
    const noRepeat = scoreSpam({
      email: "user@example.com",
      message: "I have a question about your services and would like more information.",
    });
    const withRepeat = scoreSpam({
      email: "user@example.com",
      message: "I have a question!!!!!!! about your services!!!!!!! and would like more info!!!!!!!",
    });
    assert.ok(withRepeat > noRepeat, "Repeated characters should score higher");
  });

  await t.test("all caps message increases score", () => {
    const normal = scoreSpam({
      email: "user@example.com",
      message: "This is a normal message with fifty characters minimum here.",
    });
    const allCaps = scoreSpam({
      email: "user@example.com",
      message: "THIS IS AN ALL CAPS MESSAGE WITH FIFTY CHARACTERS MINIMUM HERE.",
    });
    assert.ok(allCaps > normal, "All caps should score higher");
  });

  await t.test("legitimate message scores low", () => {
    const score = scoreSpam({
      email: "john.doe@gmail.com",
      message: "Hello, I am interested in learning more about your web development services. Could you send me some information?",
      topic: "Web Development",
    });
    assert.ok(score < SPAM_THRESHOLD, "Legitimate message should be below threshold");
  });

  await t.test("obvious spam scores high", () => {
    const score = scoreSpam({
      email: "spammer@tempmail.com",
      message:
        "BUY NOW!!!!! Visit http://spam.com http://spam2.com http://spam3.com http://spam4.com for great deals!!!!!!",
    });
    assert.ok(score >= SPAM_THRESHOLD, "Obvious spam should meet or exceed threshold");
  });
});
