import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import {
  MAX_TOASTS,
  TOAST_MS,
  dismissToast,
  getToasts,
  resetToasts,
  showToast,
  subscribeToasts,
  toast,
} from "./toast";

afterEach(() => {
  mock.timers.reset();
  resetToasts();
});

test("showToast appends in order and returns increasing ids", () => {
  const first = toast.success("Saved");
  const second = toast.error("Failed");
  assert.ok(second > first);
  assert.deepEqual(
    getToasts().map((item) => [item.kind, item.message]),
    [
      ["success", "Saved"],
      ["error", "Failed"],
    ]
  );
});

test("dismissToast removes one toast and notifies subscribers once", () => {
  let calls = 0;
  const unsubscribe = subscribeToasts(() => {
    calls += 1;
  });
  const id = toast.info("Heads up");
  const other = toast.info("Another");
  calls = 0;
  dismissToast(id);
  assert.equal(calls, 1);
  assert.deepEqual(
    getToasts().map((item) => item.id),
    [other]
  );
  dismissToast(id);
  assert.equal(calls, 1, "dismissing an unknown id is a no-op");
  unsubscribe();
});

test("the snapshot is stable between changes", () => {
  toast.success("One");
  assert.equal(getToasts(), getToasts());
});

test("only the newest MAX_TOASTS stay", () => {
  for (let index = 0; index < MAX_TOASTS + 2; index += 1) {
    showToast("info", `Toast ${index}`, 0);
  }
  const messages = getToasts().map((item) => item.message);
  assert.equal(messages.length, MAX_TOASTS);
  assert.equal(messages.at(-1), `Toast ${MAX_TOASTS + 1}`);
  assert.equal(messages[0], "Toast 2");
});

test("toasts dismiss themselves and errors stay longer than successes", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  toast.success("Saved");
  toast.error("Failed");
  assert.ok(TOAST_MS.error > TOAST_MS.success);

  mock.timers.tick(TOAST_MS.success);
  assert.deepEqual(
    getToasts().map((item) => item.kind),
    ["error"]
  );

  mock.timers.tick(TOAST_MS.error - TOAST_MS.success);
  assert.equal(getToasts().length, 0);
});

test("a duration of 0 keeps the toast until it is dismissed", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const id = showToast("info", "Sticky", 0);
  mock.timers.tick(60_000);
  assert.equal(getToasts().length, 1);
  dismissToast(id);
  assert.equal(getToasts().length, 0);
});
