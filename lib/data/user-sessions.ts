import type { RoleName } from "@/lib/auth/permissions";

// Session rows as the admin screens see them. Sign-in, revocation and the
// session cache go through auth-kit's adapter (lib/data/prisma/auth-adapter.ts).

export interface SessionOwner {
  id: string;
  userId: string;
  user: { email: string; role: RoleName };
}

export type SessionStatusFilter = "active" | "ended" | "all";

/** Where a page of sessions ends: the next page starts strictly after it. */
export interface SessionCursor {
  lastSeenAt: Date;
  id: string;
}

export interface SessionQuery {
  /** Case-insensitive match on the owner's email or name, or part of the IP. */
  q?: string;
  userId?: string;
  status: SessionStatusFilter;
  after?: SessionCursor;
  limit: number;
  now: Date;
}

export interface SessionRow {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  userRole: RoleName;
  ip: string | null;
  browser: string | null;
  os: string | null;
  device: string | null;
  mfaVerified: boolean;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
}

export interface SessionTarget extends SessionOwner {
  revokedAt: Date | null;
  expiresAt: Date;
}

export interface UserSessionRepo {
  /**
   * One page, newest activity first, keyset-paged on (lastSeenAt, id) so a
   * deep page costs the same as the first and rows never shift between pages.
   */
  search(query: SessionQuery): Promise<{ items: SessionRow[]; next: SessionCursor | null }>;
  /** A bulk selection with owners and liveness, in one read. */
  findManyWithOwner(ids: string[]): Promise<SessionTarget[]>;
  /** Live sessions of these users (id and owner), in one read. */
  listLiveForUsers(userIds: string[], now: Date): Promise<{ id: string; userId: string }[]>;
  findWithOwner(id: string): Promise<SessionOwner | null>;
  isOwnedBy(id: string, userId: string): Promise<boolean>;
  listIdsForUser(userId: string): Promise<string[]>;
  markMfaVerified(id: string): Promise<void>;
}
