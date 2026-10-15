import type { ItshoverIconName } from "@/components/icons/Icon";
import type { Permission, RoleName } from "@/lib/auth/permissions";

// Which dashboard widgets a viewer sees, and in what order. Permissions decide
// what may be shown (a widget whose data the viewer cannot read is never
// rendered or queried); the role decides the focus, so a developer opens on
// system health, the owner on the business picture, a manager on growth and
// an editor on their content. A custom role gets the focus its permissions
// suggest. Pure, so it is unit-tested without a session.

export type DashboardFocus = "operations" | "overview" | "growth" | "content";

export type WidgetId = "quickActions" | "analytics" | "trend" | "health" | "security" | "activity" | "pipeline" | "inbox";

/** Columns a widget takes on the six-column desktop grid. */
export type WidgetSpan = 2 | 3 | 4 | 5 | 6;

export interface DashboardCan {
  analytics: boolean;
  audit: boolean;
  content: boolean;
  blog: boolean;
  leads: boolean;
  chat: boolean;
  health: boolean;
  sessions: boolean;
}

export interface DashboardViewer {
  role: RoleName;
  permissions: readonly Permission[];
  mfaSetupRequired?: boolean;
}

const holds = (viewer: DashboardViewer, permission: Permission) => !viewer.mfaSetupRequired && viewer.permissions.includes(permission);

export function capabilitiesOf(viewer: DashboardViewer): DashboardCan {
  return {
    analytics: holds(viewer, "viewAnalytics"),
    audit: holds(viewer, "viewAuditLogs"),
    content: holds(viewer, "editPages") || holds(viewer, "editCollections"),
    blog: holds(viewer, "viewBlog"),
    leads: holds(viewer, "viewLeads"),
    chat: holds(viewer, "viewChatHistory"),
    health: holds(viewer, "viewSecurityStatus"),
    sessions: holds(viewer, "viewSessions"),
  };
}

const ROLE_FOCUS: Partial<Record<RoleName, DashboardFocus>> = {
  DEVELOPER: "operations",
  SUPER_ADMIN: "overview",
  MANAGER: "growth",
  EDITOR: "content",
};

export function focusOf(role: RoleName, can: DashboardCan): DashboardFocus {
  const known = ROLE_FOCUS[role];
  if (known) return known;
  if (can.health || can.sessions) return "operations";
  if (can.analytics || can.leads) return "growth";
  return "content";
}

const WIDGET_SPAN: Record<WidgetId, WidgetSpan> = {
  quickActions: 6,
  analytics: 6,
  trend: 4,
  health: 2,
  security: 3,
  activity: 3,
  pipeline: 3,
  inbox: 3,
};

const ALLOWED: Record<WidgetId, (can: DashboardCan) => boolean> = {
  quickActions: () => true,
  analytics: (can) => can.analytics,
  trend: (can) => can.leads || can.content || can.audit,
  health: (can) => can.health,
  security: (can) => can.sessions,
  activity: (can) => can.audit,
  pipeline: (can) => can.blog,
  inbox: (can) => can.leads,
};

// Written in rows that fill six columns (4+2, 3+3, 6); planDashboard closes
// any row a missing permission leaves short.
const ORDER: Record<DashboardFocus, WidgetId[]> = {
  operations: ["trend", "health", "security", "activity", "analytics", "pipeline", "inbox", "quickActions"],
  overview: ["analytics", "inbox", "pipeline", "trend", "health", "security", "activity", "quickActions"],
  growth: ["analytics", "inbox", "pipeline", "trend", "health", "activity", "security", "quickActions"],
  content: ["quickActions", "pipeline", "inbox", "trend", "health", "analytics", "activity", "security"],
};

export const FOCUS_SUBTITLE: Record<DashboardFocus, string> = {
  operations: "System health, security and what changed.",
  overview: "Traffic, inquiries and content at a glance.",
  growth: "Who is visiting, what they read, and who got in touch.",
  content: "Your drafts, your schedule and what readers see.",
};

export interface PlannedWidget {
  id: WidgetId;
  span: WidgetSpan;
}

export interface DashboardPlan {
  focus: DashboardFocus;
  can: DashboardCan;
  widgets: PlannedWidget[];
}

/**
 * Lays widgets into rows of six columns, in order. When the next widget does
 * not fit, the row's last widget widens to fill it, so no row ends in a gap.
 */
export function packRows(ids: WidgetId[]): PlannedWidget[] {
  const out: PlannedWidget[] = [];
  let used = 0;
  const closeRow = () => {
    const last = out.at(-1);
    if (last && used > 0 && used < 6) last.span = (last.span + 6 - used) as WidgetSpan;
    used = 0;
  };
  for (const id of ids) {
    const span = WIDGET_SPAN[id];
    if (used + span > 6) closeRow();
    out.push({ id, span });
    used += span;
    if (used === 6) used = 0;
  }
  closeRow();
  return out;
}

export function planDashboard(viewer: DashboardViewer): DashboardPlan {
  const can = capabilitiesOf(viewer);
  const focus = focusOf(viewer.role, can);
  return { focus, can, widgets: packRows(ORDER[focus].filter((id) => ALLOWED[id](can))) };
}

export type TileId = "visitors" | "inquiries" | "unpublished" | "published" | "activity" | "security";

const TILE_ORDER: Record<DashboardFocus, TileId[]> = {
  operations: ["activity", "security", "inquiries", "visitors", "unpublished", "published"],
  overview: ["visitors", "inquiries", "unpublished", "activity", "published", "security"],
  growth: ["visitors", "inquiries", "published", "unpublished", "activity", "security"],
  content: ["unpublished", "published", "visitors", "inquiries", "activity", "security"],
};

const TILE_ALLOWED: Record<TileId, (can: DashboardCan) => boolean> = {
  visitors: (can) => can.analytics,
  inquiries: (can) => can.leads,
  unpublished: (can) => can.content,
  published: (can) => can.content,
  activity: (can) => can.audit,
  security: () => true,
};

/** The four headline numbers for this focus, from what the viewer may read. */
export function tilesFor(plan: Pick<DashboardPlan, "focus" | "can">, limit = 4): TileId[] {
  return TILE_ORDER[plan.focus].filter((id) => TILE_ALLOWED[id](plan.can)).slice(0, limit);
}

export interface QuickAction {
  href: string;
  label: string;
  icon: ItshoverIconName;
  permission: Permission;
}

const QUICK_ACTIONS: QuickAction[] = [
  { href: "/admin/blog/new", label: "Write a post", icon: "pen", permission: "editBlog" },
  { href: "/admin/media", label: "Upload media", icon: "upload", permission: "uploadMedia" },
  { href: "/admin/content", label: "Edit pages", icon: "file-description", permission: "editPages" },
  { href: "/admin/works", label: "Update works", icon: "stack-3", permission: "editCollections" },
  { href: "/admin/leads?status=NEW", label: "Answer inquiries", icon: "mail-filled", permission: "viewLeads" },
  { href: "/admin/chatbot", label: "Chatbot", icon: "brain-circuit", permission: "viewChatHistory" },
  { href: "/admin/users", label: "Invite someone", icon: "user-check", permission: "inviteUser" },
  { href: "/admin/settings", label: "Site settings", icon: "gear", permission: "manageSettings" },
];

/** Shortcuts the viewer may use, at most `limit`. */
export function quickActionsFor(viewer: DashboardViewer, limit = 6): QuickAction[] {
  return QUICK_ACTIONS.filter((action) => holds(viewer, action.permission)).slice(0, limit);
}
