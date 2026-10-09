import "server-only";

import type { RoleName } from "@/lib/auth/permissions";
import type { UserListItem, UserPage, UserQuery } from "@/lib/data/users";
import { repos } from "@/lib/data";

// Reads for the users screen. Rules live in rules.ts; changes are made by the
// actions in lib/actions/users.ts, which audit them.

export type { UserListItem };

export async function listUsers(): Promise<UserListItem[]> {
  return repos.users.list();
}

/** One page of the users screen: search, filters and sort run in the database. */
export async function searchUsers(query: UserQuery): Promise<UserPage> {
  return repos.users.search(query);
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
  const rows = await repos.authTokens.listOpenInvites(new Date());
  const creators = await repos.users.findRefs([
    ...new Set(rows.map((row) => row.createdById).filter((id): id is string => Boolean(id))),
  ]);
  const byId = new Map(creators.map((user) => [user.id, user.email]));
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role ?? "EDITOR",
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    createdByEmail: row.createdById ? (byId.get(row.createdById) ?? null) : null,
  }));
}

/** Enabled DEVELOPER accounts. The last one can never be demoted, disabled or deleted. */
export async function countActiveDevelopers(): Promise<number> {
  return repos.users.countActiveDevelopers();
}

export async function findUserRef(id: string) {
  return repos.users.findRef(id);
}
