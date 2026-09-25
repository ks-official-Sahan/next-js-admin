import "server-only";

import { createSessionStore } from "@sahan-sac/auth-kit/session";

import { kv } from "@/lib/cache/redis";

import { AUTH_SECRET } from "./kit";
import { prismaAuthAdapter } from "./prisma-adapter";

// Server side of a session: the Postgres row is the authority, Redis holds a
// 30 second copy of its state so most requests skip the database.

export const {
  createSession,
  isKnownDevice,
  getSessionState,
  invalidateSessionState,
  touchSession,
  invalidateUserSessionState,
  revokeSession,
  revokeUserSessions,
  forceLogoutAll,
  getKnownIps,
  listSessions,
} = createSessionStore({ adapter: prismaAuthAdapter, kv, authSecret: AUTH_SECRET });

export type { KnownIp, NewSession, Revoker, SessionListItem } from "@sahan-sac/auth-kit/session";
