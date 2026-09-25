import "server-only";

import type { RoleName } from "@/lib/auth/permissions";
import { db } from "@/lib/db/prisma";

// Reads for the users screen. Rules live in rules.ts; changes are made by the
// actions in lib/actions/users.ts, which audit them.

export interface UserListItem {
  id: string;
  email: string;
  name: string | null;
  role: RoleName;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  disabledAt: Date | null;
  activeSessions: number;
}

export async function listUsers(): Promise<UserListItem[]> {
  const rows = await db.user.findMany({
    orderBy: [{ disabledAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      mfaEnabled: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
      disabledAt: true,
      _count: { select: { sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } },
    },
  });
  return rows.map(({ _count, role, ...row }) => ({ ...row, role: role as RoleName, activeSessions: _count.sessions }));
}

export interface PendingInvite {
  id: string;
  email: string;
  role: RoleName;
  createdAt: Date;
  expiresAt: Date;
  createdByEmail: string | null;
}

/** Invitations that can still be accepted. */
export async function listPendingInvites(): Promise<PendingInvite[]> {
  const rows = await db.authToken.findMany({
    where: { purpose: "INVITE", usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, role: true, createdAt: true, expiresAt: true, createdById: true },
  });
  const creators = await db.user.findMany({
    where: { id: { in: rows.map((row) => row.createdById).filter((id): id is string => Boolean(id)) } },
    select: { id: true, email: true },
  });
  const byId = new Map(creators.map((user) => [user.id, user.email]));
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: (row.role ?? "EDITOR") as RoleName,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    createdByEmail: row.createdById ? (byId.get(row.createdById) ?? null) : null,
  }));
}

/** Enabled DEVELOPER accounts. The last one can never be demoted, disabled or deleted. */
export async function countActiveDevelopers(): Promise<number> {
  return db.user.count({ where: { role: "DEVELOPER", disabledAt: null } });
}

export async function findUserRef(id: string) {
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, disabledAt: true },
  });
  return user ? { ...user, role: user.role as RoleName } : null;
}
