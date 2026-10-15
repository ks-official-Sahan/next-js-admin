import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_GRANTS, PERMISSIONS, type Permission } from "../auth/permissions";
import { packRows, planDashboard, quickActionsFor, tilesFor } from "./dashboard-plan";

const viewer = (role: string, permissions: readonly Permission[], mfaSetupRequired = false) => ({ role, permissions, mfaSetupRequired });
const ids = (plan: ReturnType<typeof planDashboard>) => plan.widgets.map((widget) => widget.id);
const rowsFill = (plan: ReturnType<typeof planDashboard>) => {
  let used = 0;
  for (const widget of plan.widgets) {
    used += widget.span;
    assert.ok(used <= 6, `row overflows at ${widget.id}`);
    if (used === 6) used = 0;
  }
  assert.equal(used, 0, "last row ends short");
};

test("each built-in role gets its own focus and first widget", () => {
  const developer = planDashboard(viewer("DEVELOPER", PERMISSIONS));
  assert.equal(developer.focus, "operations");
  assert.equal(ids(developer)[0], "trend");
  assert.ok(ids(developer).includes("health"));

  const owner = planDashboard(viewer("SUPER_ADMIN", PERMISSIONS));
  assert.equal(owner.focus, "overview");
  assert.equal(ids(owner)[0], "analytics");

  const manager = planDashboard(viewer("MANAGER", DEFAULT_GRANTS.MANAGER));
  assert.equal(manager.focus, "growth");
  assert.equal(ids(manager)[0], "analytics");

  const editor = planDashboard(viewer("EDITOR", DEFAULT_GRANTS.EDITOR));
  assert.equal(editor.focus, "content");
  assert.equal(ids(editor)[0], "quickActions");
});

test("permissions decide what is shown: an editor never sees analytics, leads, health or audit", () => {
  const editor = planDashboard(viewer("EDITOR", DEFAULT_GRANTS.EDITOR));
  for (const hidden of ["analytics", "inbox", "health", "security", "activity"] as const) {
    assert.equal(ids(editor).includes(hidden), false, hidden);
  }
  assert.deepEqual(tilesFor(editor), ["unpublished", "published", "security"]);
});

test("a custom role takes the focus its permissions suggest", () => {
  assert.equal(planDashboard(viewer("SUPPORT", ["viewDashboard", "viewSessions"])).focus, "operations");
  assert.equal(planDashboard(viewer("MARKETING", ["viewDashboard", "viewAnalytics"])).focus, "growth");
  assert.equal(planDashboard(viewer("WRITER", ["viewDashboard", "viewBlog"])).focus, "content");
});

test("a user who still has to set up MFA sees no permission-gated widget", () => {
  const plan = planDashboard(viewer("DEVELOPER", PERMISSIONS, true));
  assert.deepEqual(ids(plan), ["quickActions"]);
  assert.deepEqual(quickActionsFor(viewer("DEVELOPER", PERMISSIONS, true)), []);
});

test("rows always fill six columns, whatever the permissions remove", () => {
  const sets: [string, readonly Permission[]][] = [
    ["DEVELOPER", PERMISSIONS],
    ["SUPER_ADMIN", PERMISSIONS],
    ["MANAGER", DEFAULT_GRANTS.MANAGER],
    ["EDITOR", DEFAULT_GRANTS.EDITOR],
    ["X", ["viewDashboard", "viewLeads"]],
    ["X", ["viewDashboard", "viewSecurityStatus"]],
    ["X", ["viewDashboard", "viewSessions", "viewBlog"]],
  ];
  for (const [role, permissions] of sets) rowsFill(planDashboard(viewer(role, permissions)));
});

test("packRows widens the last widget of a short row", () => {
  assert.deepEqual(packRows(["trend", "security"]), [
    { id: "trend", span: 6 },
    { id: "security", span: 6 },
  ]);
  assert.deepEqual(packRows(["inbox", "health", "analytics"]), [
    { id: "inbox", span: 3 },
    { id: "health", span: 3 },
    { id: "analytics", span: 6 },
  ]);
});

test("quick actions follow permissions and stay at six or fewer", () => {
  assert.equal(quickActionsFor(viewer("DEVELOPER", PERMISSIONS)).length, 6);
  const editor = quickActionsFor(viewer("EDITOR", DEFAULT_GRANTS.EDITOR)).map((action) => action.href);
  assert.deepEqual(editor, ["/admin/blog/new", "/admin/media", "/admin/content", "/admin/works"]);
});
