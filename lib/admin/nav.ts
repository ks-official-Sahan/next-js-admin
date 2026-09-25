import {
  Bot,
  Briefcase,
  FileText,
  ImageIcon,
  Inbox,
  LayoutDashboard,
  MonitorSmartphone,
  Newspaper,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCircle,
  Users,
  type LucideIcon,
} from "lucide-react";

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
  icon: LucideIcon;
  /** Permission that shows the link. `null` means every signed-in user. */
  permission: Permission | null;
  group: AdminNavGroupId;
}

/** Declared in display order: groups first, then items inside each group. */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: ADMIN_HOME, label: "Dashboard", icon: LayoutDashboard, permission: "viewDashboard", group: "overview" },
  { href: "/admin/content", label: "Pages", icon: FileText, permission: "editPages", group: "content" },
  { href: "/admin/works", label: "Works", icon: Briefcase, permission: "editCollections", group: "content" },
  { href: "/admin/blog", label: "Blog", icon: Newspaper, permission: "viewBlog", group: "content" },
  { href: "/admin/media", label: "Media", icon: ImageIcon, permission: "viewMedia", group: "content" },
  { href: "/admin/leads", label: "Leads", icon: Inbox, permission: "viewLeads", group: "audience" },
  { href: "/admin/chatbot", label: "Chatbot", icon: Bot, permission: "viewChatHistory", group: "audience" },
  { href: "/admin/users", label: "Users", icon: Users, permission: "viewUsers", group: "access" },
  { href: "/admin/roles", label: "Roles", icon: ShieldCheck, permission: "managePermissions", group: "access" },
  { href: "/admin/sessions", label: "Sessions", icon: MonitorSmartphone, permission: "viewSessions", group: "access" },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText, permission: "viewAuditLogs", group: "access" },
  { href: "/admin/settings", label: "Settings", icon: Settings, permission: "manageSettings", group: "system" },
  { href: "/admin/account", label: "Account", icon: UserCircle, permission: null, group: "account" },
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
        (item.permission === null || allowed.has(item.permission))
    ),
  })).filter((section) => section.items.length > 0);
}
