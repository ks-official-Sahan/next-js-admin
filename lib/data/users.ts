import type { RoleName } from "@/lib/auth/permissions";

export interface UserAccessState {
  id: string;
  role: RoleName;
  disabledAt: Date | null;
}

export interface UserRef extends UserAccessState {
  email: string;
  name: string | null;
}

export interface UserProfile {
  name: string | null;
  bio: string | null;
  mfaEnabled: boolean;
  /** Developer masking, one by one (lib/auth/mask.ts). */
  masked: boolean;
  lastLoginAt: Date | null;
}

export interface UserListItem {
  id: string;
  email: string;
  name: string | null;
  role: RoleName;
  masked: boolean;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  disabledAt: Date | null;
  /** Sessions not revoked and not expired. */
  activeSessions: number;
}

export type UserStatusFilter = "active" | "disabled" | "must-change" | "two-factor" | "no-two-factor";
export type UserSort = "default" | "name" | "email" | "role" | "last-login" | "created";

/**
 * Roles as a viewer who does not see through developer masks sees them
 * (lib/auth/mask.ts): masked super-role accounts filter and sort as `maskAs`.
 */
export interface PresentRoles {
  superRole: RoleName;
  maskAs: RoleName;
  /** Every super-role account is masked, not only the ones with users.masked. */
  global: boolean;
  /** Every role name, to sort by the role shown. */
  roles: readonly RoleName[];
}

/** One page of the users screen, filtered and sorted in the database. */
export interface UserQuery {
  /** Case-insensitive match on email or name. */
  q?: string;
  role?: RoleName;
  status?: UserStatusFilter;
  /** "default": enabled before disabled, then oldest first. */
  sort: UserSort;
  dir: "asc" | "desc";
  offset: number;
  limit: number;
  /** Set for a viewer who sees masked accounts under another role. */
  present?: PresentRoles;
}

export interface UserPage {
  items: UserListItem[];
  /** Matching rows across every page. */
  total: number;
}

export interface NewUser {
  email: string;
  name: string | null;
  role: RoleName;
  passwordHash: string;
  mustChangePassword?: boolean;
  createdById: string | null;
}

export type UserPatch = Partial<{
  email: string;
  name: string | null;
  bio: string | null;
  role: RoleName;
  disabledAt: Date | null;
  passwordHash: string;
  passwordChangedAt: Date;
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  masked: boolean;
}>;

export interface UserRepo {
  findAccessState(id: string): Promise<UserAccessState | null>;
  findRef(id: string): Promise<UserRef | null>;
  findRefByEmail(email: string): Promise<UserRef | null>;
  findRefs(ids: string[]): Promise<UserRef[]>;
  existsByEmail(email: string): Promise<boolean>;
  findProfile(id: string): Promise<UserProfile | null>;
  findPasswordHash(id: string): Promise<string | null>;
  findSecurityStatus(id: string): Promise<{ mfaEnabled: boolean; mustChangePassword: boolean } | null>;
  /** Enabled first, then oldest first. */
  list(): Promise<UserListItem[]>;
  search(query: UserQuery): Promise<UserPage>;
  /** People with at least one live session, for the force-logout list. */
  listWithLiveSessions(now: Date): Promise<UserRef[]>;
  count(): Promise<number>;
  countActiveDevelopers(): Promise<number>;
  /** Every account holding `role` with its own mask flag: a handful of rows. */
  maskFlags(role: RoleName): Promise<Array<{ id: string; masked: boolean }>>;
  /**
   * Inside withTx only: locks every DEVELOPER row until the transaction ends,
   * then counts the enabled ones, so two concurrent demotions cannot both
   * pass a "not the last developer" check.
   */
  lockActiveDevelopers(): Promise<number>;
  create(input: NewUser): Promise<{ id: string }>;
  update(id: string, patch: UserPatch): Promise<void>;
  /** One statement for a bulk action's targets (call inside withTx with the audit rows). */
  updateMany(ids: string[], patch: Pick<UserPatch, "role" | "disabledAt">): Promise<void>;
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
}
