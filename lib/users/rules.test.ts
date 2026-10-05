import assert from "node:assert/strict";
import { test } from "node:test";

import type { RoleName } from "@/lib/auth/permissions";

import { checkChangeRole, checkDelete, checkInvite, checkReset, checkSetDisabled, planBulk, type Subject } from "./rules";

const actor = (role: RoleName, id = "actor") => ({ id, role });
const target = (role: RoleName, over: Partial<Subject> = {}): Subject => ({ id: "target", role, disabled: false, ...over });
const reason = (check: { ok: boolean; error?: string }) => (check.ok ? "ok" : check.error);

test("an EDITOR can do none of it", () => {
  const editor = actor("EDITOR");
  const victim = target("EDITOR");
  assert.equal(checkChangeRole({ actor: editor, target: victim, newRole: "MANAGER", activeDevelopers: 2 }).ok, false);
  assert.equal(checkSetDisabled({ actor: editor, target: victim, disabled: true, activeDevelopers: 2 }).ok, false);
  assert.equal(checkDelete({ actor: editor, target: victim, activeDevelopers: 2 }).ok, false);
  assert.equal(checkReset({ actor: editor, target: victim, activeDevelopers: 2 }).ok, false);
  assert.equal(checkInvite(editor, "EDITOR").ok, false);
});

test("nobody changes, disables, deletes or resets themselves", () => {
  for (const role of ["DEVELOPER", "MANAGER", "EDITOR"] as const) {
    const self = { id: "same", role };
    const me = target(role, { id: "same" });
    assert.equal(checkChangeRole({ actor: self, target: me, newRole: role === "EDITOR" ? "MANAGER" : "EDITOR", activeDevelopers: 3 }).ok, false, role);
    assert.equal(checkSetDisabled({ actor: self, target: me, disabled: true, activeDevelopers: 3 }).ok, false, role);
    assert.equal(checkDelete({ actor: self, target: me, activeDevelopers: 3 }).ok, false, role);
    assert.equal(checkReset({ actor: self, target: me, activeDevelopers: 3 }).ok, false, role);
  }
});

test("MANAGER manages EDITORs only, and can only hand out the EDITOR role", () => {
  const manager = actor("MANAGER");
  assert.equal(checkSetDisabled({ actor: manager, target: target("EDITOR"), disabled: true, activeDevelopers: 1 }).ok, true);
  assert.equal(checkReset({ actor: manager, target: target("EDITOR"), activeDevelopers: 1 }).ok, true);
  assert.equal(checkSetDisabled({ actor: manager, target: target("MANAGER"), disabled: true, activeDevelopers: 1 }).ok, false);
  assert.equal(checkSetDisabled({ actor: manager, target: target("DEVELOPER"), disabled: true, activeDevelopers: 2 }).ok, false);
  assert.equal(checkChangeRole({ actor: manager, target: target("EDITOR"), newRole: "MANAGER", activeDevelopers: 1 }).ok, false);
  assert.equal(checkInvite(manager, "EDITOR").ok, true);
  assert.equal(checkInvite(manager, "MANAGER").ok, false);
  assert.equal(checkInvite(manager, "DEVELOPER").ok, false);
});

test("only a DEVELOPER can delete", () => {
  assert.equal(checkDelete({ actor: actor("MANAGER"), target: target("EDITOR"), activeDevelopers: 1 }).ok, false);
  assert.equal(checkDelete({ actor: actor("DEVELOPER"), target: target("EDITOR"), activeDevelopers: 1 }).ok, true);
});

test("the last enabled DEVELOPER cannot be demoted, disabled or deleted", () => {
  const dev = actor("DEVELOPER");
  const last = target("DEVELOPER");
  assert.match(reason(checkChangeRole({ actor: dev, target: last, newRole: "MANAGER", activeDevelopers: 1 }))!, /last developer/);
  assert.match(reason(checkSetDisabled({ actor: dev, target: last, disabled: true, activeDevelopers: 1 }))!, /last developer/);
  assert.match(reason(checkDelete({ actor: dev, target: last, activeDevelopers: 1 }))!, /last developer/);
});

test("with two enabled DEVELOPERs one of them may go", () => {
  const dev = actor("DEVELOPER");
  const other = target("DEVELOPER");
  assert.equal(checkChangeRole({ actor: dev, target: other, newRole: "MANAGER", activeDevelopers: 2 }).ok, true);
  assert.equal(checkSetDisabled({ actor: dev, target: other, disabled: true, activeDevelopers: 2 }).ok, true);
  assert.equal(checkDelete({ actor: dev, target: other, activeDevelopers: 2 }).ok, true);
});

test("a disabled DEVELOPER does not count as the last one", () => {
  const dev = actor("DEVELOPER");
  const gone = target("DEVELOPER", { disabled: true });
  assert.equal(checkDelete({ actor: dev, target: gone, activeDevelopers: 1 }).ok, true);
});

test("no-op changes and resets for disabled users are refused", () => {
  const dev = actor("DEVELOPER");
  assert.equal(checkChangeRole({ actor: dev, target: target("EDITOR"), newRole: "EDITOR", activeDevelopers: 2 }).ok, false);
  assert.equal(checkSetDisabled({ actor: dev, target: target("EDITOR"), disabled: false, activeDevelopers: 2 }).ok, false);
  assert.equal(checkSetDisabled({ actor: dev, target: target("EDITOR", { disabled: true }), disabled: true, activeDevelopers: 2 }).ok, false);
  assert.equal(checkSetDisabled({ actor: dev, target: target("EDITOR", { disabled: true }), disabled: false, activeDevelopers: 2 }).ok, true);
  assert.equal(checkReset({ actor: dev, target: target("EDITOR", { disabled: true }), activeDevelopers: 2 }).ok, false);
});

const person = (id: string, role: RoleName, disabled = false) => ({ id, role, disabled, email: `${id}@example.com` });

test("a bulk disable never takes the last enabled developer, even when each row alone would pass", () => {
  const plan = planBulk({
    op: "disable",
    actor: actor("DEVELOPER"),
    activeDevelopers: 3,
    targets: [person("dev-a", "DEVELOPER"), person("dev-b", "DEVELOPER"), person("dev-c", "DEVELOPER")],
  });
  // The actor is not among the three, so with the actor there are four
  // developers in reality; the count passed in is what the database said.
  assert.deepEqual(
    plan.apply.map((target) => target.id),
    ["dev-a", "dev-b"]
  );
  assert.deepEqual(plan.skipped.map(({ target, reason: why }) => [target.id, why]), [["dev-c", "The last developer cannot be disabled."]]);
});

test("a bulk demotion counts developers down too; promotions and disabled developers do not", () => {
  const plan = planBulk({
    op: "role",
    role: "EDITOR",
    actor: actor("DEVELOPER"),
    activeDevelopers: 2,
    targets: [person("dev-off", "DEVELOPER", true), person("dev-a", "DEVELOPER"), person("dev-b", "DEVELOPER"), person("ed", "MANAGER")],
  });
  assert.deepEqual(
    plan.apply.map((target) => target.id),
    ["dev-off", "dev-a", "ed"]
  );
  assert.equal(plan.skipped[0]?.target.id, "dev-b");
});

test("bulk rules skip the actor and anyone out of reach, with the single-user reason", () => {
  const plan = planBulk({
    op: "sign-out",
    actor: actor("MANAGER", "me"),
    activeDevelopers: 1,
    targets: [person("me", "MANAGER"), person("boss", "DEVELOPER"), person("ed", "EDITOR")],
  });
  assert.deepEqual(
    plan.apply.map((target) => target.id),
    ["ed"]
  );
  assert.deepEqual(
    plan.skipped.map(({ reason: why }) => why),
    ["You cannot change your own account here.", "You are not allowed to manage this user."]
  );
});

test("a bulk role change without a role applies to nobody", () => {
  const plan = planBulk({ op: "role", actor: actor("DEVELOPER"), activeDevelopers: 2, targets: [person("ed", "EDITOR")] });
  assert.equal(plan.apply.length, 0);
  assert.equal(plan.skipped[0]?.reason, "Choose a role.");
});

test("only a developer bulk-deletes", () => {
  const manager = planBulk({ op: "delete", actor: actor("MANAGER"), activeDevelopers: 1, targets: [person("ed", "EDITOR")] });
  assert.equal(manager.apply.length, 0);
  const developer = planBulk({ op: "delete", actor: actor("DEVELOPER"), activeDevelopers: 1, targets: [person("ed", "EDITOR")] });
  assert.equal(developer.apply.length, 1);
});
