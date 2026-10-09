import type { RoleName } from "@/lib/auth/permissions";

export type TokenPurpose = "INVITE" | "PASSWORD_RESET" | "EMAIL_CHANGE";

/** Invite, password-reset and email-change links. Only the token's hash is stored. */
export interface AuthTokenRow {
  id: string;
  purpose: TokenPurpose;
  email: string;
  userId: string | null;
  /** Role granted on acceptance (invites only). */
  role: RoleName | null;
  tokenHash: string;
  createdById: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export type NewAuthToken = Pick<AuthTokenRow, "purpose" | "email" | "tokenHash" | "expiresAt"> &
  Partial<Pick<AuthTokenRow, "userId" | "role" | "createdById">>;

export interface AuthTokenRepo {
  findByHash(tokenHash: string): Promise<AuthTokenRow | null>;
  /** Invitations not used, revoked or expired, newest first. */
  listOpenInvites(now: Date): Promise<AuthTokenRow[]>;
  /** An invitation that is neither used nor revoked. */
  findOpenInvite(id: string): Promise<AuthTokenRow | null>;
  create(input: NewAuthToken): Promise<AuthTokenRow>;
  /** Revokes one token unconditionally (a link that could not be emailed). */
  revoke(id: string): Promise<void>;
  /** Revokes one token if still open; returns how many were revoked (0 or 1). */
  revokeIfOpen(id: string): Promise<number>;
  /** Revokes a user's open links of one purpose. */
  revokeOpenForUser(purpose: Exclude<TokenPurpose, "INVITE">, userId: string): Promise<void>;
  /** Revokes open invitations to `email` whose role is in `roles` or that `createdById` sent. */
  revokeOpenInvitesTo(email: string, scope: { roles: readonly RoleName[]; createdById: string }): Promise<void>;
  /** Revokes the open invitations a user sent. */
  revokeOpenInvitesSentBy(userId: string): Promise<void>;
  /** Open invitations that would grant this role (before the role is deleted). */
  revokeOpenInvitesForRole(role: string): Promise<number>;
  /** The same for a bulk action's targets, in one statement. */
  revokeOpenInvitesSentByAny(userIds: string[]): Promise<void>;
  /**
   * Gives an open invitation a new link: the old token stops working at once
   * and the expiry restarts. Returns 1 when it rotated, 0 when the
   * invitation was no longer open.
   */
  rotateOpenInvite(id: string, tokenHash: string, expiresAt: Date): Promise<number>;
  /** Marks an open, unexpired token used; returns 1 when this call claimed it, else 0. */
  claim(id: string, now: Date): Promise<number>;
  /** Deletes a user's own links and the unused invitations they sent. */
  deleteForUser(userId: string): Promise<void>;
  /** The same for a bulk action's targets, in one statement. */
  deleteForUsers(userIds: string[]): Promise<void>;
}
