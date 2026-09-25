import assert from "node:assert/strict";
import { test } from "node:test";

import type { RoleName } from "@/lib/auth/permissions";

import { checkChangeRole, checkDelete, checkInvite, checkReset, checkSetDisabled, type Subject } from "./rules";

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
