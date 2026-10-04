import type { RoleName } from "@/lib/auth/permissions";

// Session rows as the admin screens see them. Sign-in, revocation and the
// session cache go through auth-kit's adapter (lib/data/prisma/auth-adapter.ts).

export interface SessionOwner {
  id: string;
  userId: string;
  user: { email: string; role: RoleName };
}

export interface UserSessionRepo {
  findWithOwner(id: string): Promise<SessionOwner | null>;
  isOwnedBy(id: string, userId: string): Promise<boolean>;
  listIdsForUser(userId: string): Promise<string[]>;
  markMfaVerified(id: string): Promise<void>;
}
