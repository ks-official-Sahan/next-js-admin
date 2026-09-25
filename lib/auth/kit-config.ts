import { defineAuthKit, type Person as GenericPerson } from "@sahan-sac/auth-kit/kit";
import type { LimitRule } from "@sahan-sac/auth-kit/cache/ratelimit";
import {
  canBeGranted as canBeGrantedGeneric,
  defaultPermissionsFor as defaultPermissionsForGeneric,
  isPermission as isPermissionGeneric,
  isRole as isRoleGeneric,
  can as canGeneric,
  defaultMatrix as defaultMatrixGeneric,
  diffMatrix as diffMatrixGeneric,
  matrixFromRows as matrixFromRowsGeneric,
  matrixToRows as matrixToRowsGeneric,
  validateMatrix as validateMatrixGeneric,
  type Matrix as GenericMatrix,
  type MatrixChange,
  type MatrixCheck,
  type PermissionRow,
} from "@sahan-sac/auth-kit/rbac";

import { log } from "@/lib/log";

// The app's own RBAC catalogue, paths, cookie names, rate-limit buckets and
// CSP hosts — everything @sahan-sac/auth-kit is generic over. This
// file deliberately has no `server-only` import and reads only the public
// TRUSTED_PROXY_HOPS env var directly (never a secret, never `@/lib/env`'s
// `getEnv()`), so it can be imported from proxy.ts (Edge middleware, where
// `lib/env.ts`'s `server-only` guard cannot load — see AGENTS.md). Anything
// that needs a secret (AUTH_SECRET) lives in `./kit.ts` instead, which wraps
// the `authKit` this file exports.

export const ROLES = ["DEVELOPER", "MANAGER", "EDITOR"] as const;
export type RoleName = (typeof ROLES)[number];

export const PERMISSIONS = [
  // Dashboard
  "viewDashboard",
  // Pages
  "editPages",
  "publishPages",
  // Works collections
  "editCollections",
  "publishCollections",
  // Blog
  "viewBlog",
  "editBlog",
  "publishBlog",
  "deleteBlog",
  "generateAI",
  // Media
  "viewMedia",
  "uploadMedia",
  "deleteMedia",
  // Leads
  "viewLeads",
  "manageLeads",
  "exportData",
  // Chatbot
  "viewChatHistory",
  "manageChatbot",
  // Users
  "viewUsers",
  "inviteUser",
  "manageUsers",
  "deleteUser",
  "resetPassword",
  // Security
  "viewSessions",
  "revokeSessions",
  "forceLogout",
  "viewAuditLogs",
  "viewSecurityStatus",
  // Operations
  "manageSettings",
  "manageIpAllowlist",
  "clearSystemCache",
  "manageCron",
  // Access
  "managePermissions",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type PermissionGroup =
  | "Dashboard"
  | "Pages"
  | "Works"
  | "Blog"
  | "Media"
  | "Leads"
  | "Chatbot"
  | "Users"
  | "Security"
  | "Operations"
  | "Access";

export interface PermissionInfo {
  group: PermissionGroup;
  label: string;
  description: string;
}

export const PERMISSION_INFO: Record<Permission, PermissionInfo> = {
  viewDashboard: { group: "Dashboard", label: "View dashboard", description: "Open the admin dashboard." },
  editPages: { group: "Pages", label: "Edit pages", description: "Save drafts of page sections." },
  publishPages: { group: "Pages", label: "Publish pages", description: "Publish and restore page sections." },
  editCollections: { group: "Works", label: "Edit works data", description: "Create and edit projects, experience, services and skills. Saved unpublished." },
  publishCollections: { group: "Works", label: "Publish works data", description: "Publish, feature and reorder works items." },
  viewBlog: { group: "Blog", label: "View posts", description: "See the list of posts." },
  editBlog: { group: "Blog", label: "Edit posts", description: "Create and edit post drafts." },
  publishBlog: { group: "Blog", label: "Publish posts", description: "Publish, schedule and unpublish posts." },
  deleteBlog: { group: "Blog", label: "Delete posts", description: "Delete or archive posts." },
  generateAI: { group: "Blog", label: "Use AI helpers", description: "Draft text and cover images with the AI helpers." },
  viewMedia: { group: "Media", label: "View media", description: "See the media library and use the picker." },
  uploadMedia: { group: "Media", label: "Upload media", description: "Upload files and edit alt text and tags." },
  deleteMedia: { group: "Media", label: "Delete media", description: "Delete media assets." },
  viewLeads: { group: "Leads", label: "View leads", description: "See contact inquiries." },
  manageLeads: { group: "Leads", label: "Manage leads", description: "Change status, add notes and assign leads." },
  exportData: { group: "Leads", label: "Export data", description: "Download CSV exports of leads, audit log and sessions." },
  viewChatHistory: { group: "Chatbot", label: "View chat history", description: "Read chatbot conversations." },
  manageChatbot: { group: "Chatbot", label: "Manage chatbot", description: "Edit training entries, switch the bot on or off, set tone and greeting." },
  viewUsers: { group: "Users", label: "View users", description: "See the user list." },
  inviteUser: { group: "Users", label: "Invite users", description: "Send invitations." },
  manageUsers: { group: "Users", label: "Manage users", description: "Change roles, disable and enable users." },
  deleteUser: { group: "Users", label: "Delete users", description: "Delete user accounts." },
  resetPassword: { group: "Users", label: "Reset passwords", description: "Send a password reset link to a user." },
  viewSessions: { group: "Security", label: "View sessions", description: "See signed-in sessions." },
  revokeSessions: { group: "Security", label: "Revoke sessions", description: "Sign out one session." },
  forceLogout: { group: "Security", label: "Force logout", description: "Sign out every session of a user, or of everyone (DEVELOPER only)." },
  viewAuditLogs: { group: "Security", label: "View audit log", description: "Open the audit log." },
  viewSecurityStatus: { group: "Security", label: "View security status", description: "See integration health and security widgets." },
  manageSettings: { group: "Operations", label: "Manage settings", description: "Change settings, site identity, contact details, SEO defaults and maintenance mode." },
  manageIpAllowlist: { group: "Operations", label: "Manage IP allowlist", description: "Edit the admin IP allowlist." },
  clearSystemCache: { group: "Operations", label: "Clear cache", description: "Clear the site cache." },
  manageCron: { group: "Operations", label: "Run cron jobs", description: "Run scheduled jobs from the admin." },
  managePermissions: { group: "Access", label: "Manage permissions", description: "Edit the role permission matrix. Never grantable to any other role." },
};

/** Permissions no role except DEVELOPER can ever hold. */
export const NEVER_GRANTABLE: readonly Permission[] = ["managePermissions"];

const MANAGER_DENIED: ReadonlySet<Permission> = new Set<Permission>([
  "deleteUser",
  "manageSettings",
  "manageIpAllowlist",
  "clearSystemCache",
  "managePermissions",
]);

/** Seed defaults for the editable roles. DEVELOPER always holds everything. */
export const DEFAULT_GRANTS: Record<"MANAGER" | "EDITOR", readonly Permission[]> = {
  MANAGER: PERMISSIONS.filter((permission) => !MANAGER_DENIED.has(permission)),
  EDITOR: ["viewDashboard", "editPages", "editCollections", "viewBlog", "editBlog", "generateAI", "viewMedia", "uploadMedia"],
};

/** Bump when a release adds permissions, and record them in PERMISSION_ADDED_IN. */
export const RBAC_SEED_VERSION = 1;

/**
 * Seed version in which a permission first existed. Permissions missing from
 * this map have existed since version 1.
 */
export const PERMISSION_ADDED_IN: Partial<Record<Permission, number>> = {};

// Rate-limit buckets: every one this app uses, however it uses it (auth-kit's
// own flows plus contact/chat/uploads/AI). No default catalogue is shipped by
// the package; this is the single list.
export const LIMITS = {
  "unlock:ip": { windowSeconds: 600, max: 10, failMode: "closed" },
  "login:ip": { windowSeconds: 600, max: 10, failMode: "closed" },
  "login:acct": { windowSeconds: 900, max: 5, failMode: "closed" },
  "maintenance:ip": { windowSeconds: 600, max: 10, failMode: "closed" },
  "mfa:send:user": { windowSeconds: 600, max: 3, failMode: "closed" },
  "invite:actor": { windowSeconds: 3600, max: 20, failMode: "closed" },
  "reset:ip": { windowSeconds: 3600, max: 8, failMode: "closed" },
  "reset:email": { windowSeconds: 3600, max: 3, failMode: "closed" },
  "email-change:user": { windowSeconds: 3600, max: 3, failMode: "closed" },
  "upload:sign:user": { windowSeconds: 600, max: 30, failMode: "closed" },
  "ai:admin:user": { windowSeconds: 3600, max: 30, failMode: "closed" },
  "contact:ip": { windowSeconds: 3600, max: 5, failMode: "open" },
  "contact:global": { windowSeconds: 3600, max: 100, failMode: "open" },
  "chat:ip": { windowSeconds: 600, max: 20, failMode: "closed" },
  "chat:session": { windowSeconds: 60, max: 6, failMode: "closed" },
} as const satisfies Record<string, LimitRule>;

export type LimitName = keyof typeof LIMITS;

function trustedProxyHops(): number {
  const parsed = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 10 ? parsed : 0;
}

export const authKit = defineAuthKit<RoleName, Permission>({
  cookies: { session: "app_admin_session", unlock: "app_admin_unlock" },
  paths: {
    // Every other path already matches defineAuthKit's generic default
    // (/admin/login, /not-found, /api/auth/expire, /admin/forgot-password,
    // /admin/set-password, /admin/confirm-email, /admin); only this one
    // carries an app-specific query string.
    accountPasswordChange: "/admin/account?reason=change-password",
  },
  keyPrefix: "app:",
  roles: ROLES,
  superRole: "DEVELOPER",
  permissions: PERMISSIONS,
  neverGrantable: NEVER_GRANTABLE,
  defaultGrants: DEFAULT_GRANTS,
  // DEVELOPER manages everyone, MANAGER only EDITORs, EDITOR nobody, nobody themselves.
  canManage: (actor, target) => {
    if (actor.id === target.id) return false;
    if (actor.role === "DEVELOPER") return true;
    if (actor.role === "MANAGER") return target.role === "EDITOR";
    return false;
  },
  assignableRoles: (actorRole) => {
    if (actorRole === "DEVELOPER") return [...ROLES];
    if (actorRole === "MANAGER") return ["EDITOR"];
    return [];
  },
  limits: LIMITS,
  csp: { imgHosts: ["https://res.cloudinary.com"], connectHosts: ["https://api.cloudinary.com"] },
  trustProxy: { hops: trustedProxyHops() },
  onEvent: (event) => log.warn(`auth-kit: ${event.type}`, event),
});

// Bound, single-argument convenience wrappers around the package's generic
// RBAC helpers, for the few app call sites that want the old zero-config
// calling convention (e.g. lib/db/seed.ts's `defaults?: (role) => Permission[]`).
export const isPermission = (value: string): value is Permission => isPermissionGeneric(authKit, value);
export const isRole = (value: string): value is RoleName => isRoleGeneric(authKit, value);
export const defaultPermissionsFor = (role: RoleName): Permission[] => defaultPermissionsForGeneric(authKit, role);
export const canBeGranted = (role: RoleName, permission: Permission): boolean => canBeGrantedGeneric(authKit, role, permission);

// Same, bound convenience wrappers for the matrix engine (rbac-rules.ts) and
// the "who may manage whom" hierarchy (canManage/assignableRoles, which are
// already bound closures on the resolved kit — see defineAuthKit above).
export type Matrix = GenericMatrix<RoleName, Permission>;
export type Person = GenericPerson<RoleName>;
export type { MatrixChange, MatrixCheck, PermissionRow };

export const can = (matrix: Matrix, role: RoleName, permission: Permission): boolean => canGeneric(authKit, matrix, role, permission);
export const defaultMatrix = (): Matrix => defaultMatrixGeneric(authKit);
export const matrixFromRows = (rows: readonly PermissionRow[]): Matrix => matrixFromRowsGeneric(authKit, rows);
export const matrixToRows = (matrix: Matrix) => matrixToRowsGeneric(authKit, matrix);
export const diffMatrix = (before: Matrix, after: Matrix) => diffMatrixGeneric(authKit, before, after);
export const validateMatrix = (matrix: Matrix): MatrixCheck => validateMatrixGeneric(authKit, matrix);
export const canManage = authKit.canManage;
export const assignableRoles = authKit.assignableRoles;
