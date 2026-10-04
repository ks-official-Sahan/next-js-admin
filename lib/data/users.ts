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
  lastLoginAt: Date | null;
}

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
  /** Sessions not revoked and not expired. */
  activeSessions: number;
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
  count(): Promise<number>;
  countActiveDevelopers(): Promise<number>;
  /**
   * Inside withTx only: locks every DEVELOPER row until the transaction ends,
   * then counts the enabled ones, so two concurrent demotions cannot both
   * pass a "not the last developer" check.
   */
  lockActiveDevelopers(): Promise<number>;
  create(input: NewUser): Promise<{ id: string }>;
  update(id: string, patch: UserPatch): Promise<void>;
  delete(id: string): Promise<void>;
}
