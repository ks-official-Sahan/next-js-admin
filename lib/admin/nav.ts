import type { ItshoverIconName } from "@/components/icons/Icon";
import type { Permission } from "@/lib/auth/permissions";

import { ADMIN_HOME } from "./active";

// Admin navigation, typed against the permission catalogue. The server filters
// it per user before anything reaches the browser (design notes,
// sections 4.3 and 9). Hiding a link is a courtesy: every page and action still
// enforces its own permission.

export type AdminNavGroupId =
  | "overview"
  | "content"
  | "audience"
  | "access"
  | "system"
  | "account";

export interface AdminNavGroup {
  id: AdminNavGroupId;
  /** Heading shown above the group. `null` means no heading. */
  label: string | null;
}

export const ADMIN_NAV_GROUPS: readonly AdminNavGroup[] = [
  { id: "overview", label: null },
  { id: "content", label: "Content" },
  { id: "audience", label: "Audience" },
  { id: "access", label: "Access" },
  { id: "system", label: "System" },
  { id: "account", label: null },
];

export interface AdminNavItem {
  href: string;
  label: string;
  icon: ItshoverIconName;
  /** Permission that shows the link (any one of a list). `null` means every signed-in user. */
  permission: Permission | readonly Permission[] | null;
  group: AdminNavGroupId;
}

/** Declared in display order: groups first, then items inside each group. */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: ADMIN_HOME, label: "Dashboard", icon: "layout-dashboard", permission: "viewDashboard", group: "overview" },
  { href: "/admin/content", label: "Pages", icon: "file-description", permission: "editPages", group: "content" },
  { href: "/admin/works", label: "Works", icon: "stack-3", permission: "editCollections", group: "content" },
  { href: "/admin/blog", label: "Blog", icon: "book", permission: "viewBlog", group: "content" },
  { href: "/admin/media", label: "Media", icon: "camera", permission: "viewMedia", group: "content" },
  { href: "/admin/trash", label: "Trash", icon: "trash", permission: ["deleteBlog", "deleteMedia", "publishCollections"], group: "content" },
  { href: "/admin/leads", label: "Leads", icon: "mail-filled", permission: "viewLeads", group: "audience" },
  { href: "/admin/chatbot", label: "Chatbot", icon: "brain-circuit", permission: "viewChatHistory", group: "audience" },
  { href: "/admin/users", label: "Users", icon: "users", permission: "viewUsers", group: "access" },
  { href: "/admin/roles", label: "Roles", icon: "shield-check", permission: "managePermissions", group: "access" },
  { href: "/admin/sessions", label: "Sessions", icon: "wifi", permission: "viewSessions", group: "access" },
  { href: "/admin/audit", label: "Audit log", icon: "history-circle", permission: "viewAuditLogs", group: "access" },
  { href: "/admin/settings", label: "Settings", icon: "gear", permission: "manageSettings", group: "system" },
  { href: "/admin/webhooks", label: "Webhooks", icon: "plug-connected", permission: "manageSettings", group: "system" },
  { href: "/admin/backups", label: "Backups", icon: "save", permission: "manageSettings", group: "system" },
  { href: "/admin/account", label: "Account", icon: "user", permission: null, group: "account" },
];

export interface AdminNavSection extends AdminNavGroup {
  items: AdminNavItem[];
}

/** The sections a user holding these permissions may see. Empty sections are dropped. */
export function navFor(granted: Iterable<Permission>): AdminNavSection[] {
  const allowed = new Set<Permission>(granted);
  return ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: ADMIN_NAV.filter(
      (item) =>
        item.group === group.id &&
        (item.permission === null ||
          (typeof item.permission === "string" ? allowed.has(item.permission) : item.permission.some((permission) => allowed.has(permission))))
    ),
  })).filter((section) => section.items.length > 0);
}
