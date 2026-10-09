import type { RoleRecord } from "@sahan-sac/auth-kit/rbac/roles";

export type { RoleRecord };

export interface RoleInputRow {
  name: string;
  label: string;
  description: string | null;
  rank: number;
}

/** The `roles` table. Reads go through lib/auth/roles.ts, which caches them. */
export interface RoleRepo {
  /** Every role, highest first (rank, then name). */
  list(): Promise<RoleRecord[]>;
  find(name: string): Promise<RoleRecord | null>;
  create(input: RoleInputRow): Promise<void>;
  /** A role's name never changes here: rename is not offered, so links and audit rows stay stable. */
  update(name: string, patch: Pick<RoleInputRow, "label" | "description" | "rank">): Promise<void>;
  /** Fails (foreign key) while any user still has the role; callers check `countUsers` first. */
  delete(name: string): Promise<void>;
  countUsers(name: string): Promise<number>;
  /** Users per role, in one grouped read (roles nobody holds are absent). */
  userCounts(): Promise<Record<string, number>>;
  /** Inserts the built-in rows that are missing; existing rows keep their edits. Returns how many were new. */
  seedSystem(rows: readonly RoleRecord[]): Promise<number>;
}
