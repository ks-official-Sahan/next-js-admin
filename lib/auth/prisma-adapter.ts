import "server-only";

import type { Prisma, Role } from "@prisma/client";
import type { AuthDbAdapter, MfaPurpose, RoleName } from "@sahan-sac/auth-kit/adapter";

import { db } from "@/lib/db/prisma";

function client(tx?: Prisma.TransactionClient) {
  return tx ?? db;
}

export const prismaAuthAdapter: AuthDbAdapter<Prisma.TransactionClient> = {
  withTransaction(fn) {
    return db.$transaction(fn);
  },

  // -- users --
  async findUserForAuth(email) {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true, passwordHash: true, disabledAt: true, mfaEnabled: true },
    });
    return user ? { ...user, role: user.role as RoleName } : null;
  },
  async findUserById(id) {
    const user = await db.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, passwordHash: true },
    });
    return user ? { ...user, role: user.role as RoleName } : null;
  },
  async updateLastLoginAt(userId, when) {
    await db.user.update({ where: { id: userId }, data: { lastLoginAt: when } });
  },
  async countUsers() {
    return db.user.count();
  },

  // -- sessions --
  async createUserSession(input) {
    const row = await db.userSession.create({
      data: {
        userId: input.userId,
        ip: input.ip,
        userAgent: input.userAgent,
        browser: input.browser,
        os: input.os,
        device: input.device,
        mfaVerified: input.mfaVerified,
        expiresAt: input.expiresAt,
      },
      select: { id: true },
    });
    return row;
  },
  async findFirstSessionByFingerprint(input) {
    return db.userSession.findFirst({
      where: { userId: input.userId, ip: input.ip, browser: input.browser, os: input.os },
      select: { id: true },
    });
  },
  async findSessionWithUser(sid) {
    const row = await db.userSession.findUnique({
      where: { id: sid },
      select: {
        expiresAt: true,
        revokedAt: true,
        mfaVerified: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            disabledAt: true,
            passwordHash: true,
            mustChangePassword: true,
            mfaEnabled: true,
          },
        },
      },
    });
    if (!row) return null;
    return { ...row, user: { ...row.user, role: row.user.role as RoleName } };
  },
  async touchSession(sid, when) {
    await db.userSession.updateMany({ where: { id: sid, revokedAt: null }, data: { lastSeenAt: when } });
  },
  async findActiveSessionIds(userId) {
    const rows = await db.userSession.findMany({ where: { userId, revokedAt: null }, select: { id: true } });
    return rows.map((row) => row.id);
  },
  async revokeSessionById(sid, revokedById, reason) {
    return db.userSession.updateMany({
      where: { id: sid, revokedAt: null },
      data: { revokedAt: new Date(), revokedById, revokeReason: reason },
    });
  },
  async findActiveSessionIdsExcept(userId, exceptSid) {
    const rows = await db.userSession.findMany({
      where: { userId, revokedAt: null, ...(exceptSid ? { id: { not: exceptSid } } : {}) },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  },
  async revokeSessionsByIds(ids, revokedById, reason) {
    await db.userSession.updateMany({
      where: { id: { in: ids }, revokedAt: null },
      data: { revokedAt: new Date(), revokedById, revokeReason: reason },
    });
  },
  async findAllActiveSessions(exceptUserId) {
    return db.userSession.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() }, ...(exceptUserId ? { userId: { not: exceptUserId } } : {}) },
      select: { id: true, userId: true },
    });
  },
  async findRecentSessionIps(take) {
    const rows = await db.userSession.findMany({
      where: { ip: { not: null } },
      orderBy: { lastSeenAt: "desc" },
      take,
      select: { ip: true, lastSeenAt: true, user: { select: { email: true } } },
    });
    return rows
      .filter((row): row is typeof row & { ip: string } => row.ip !== null)
      .map((row) => ({ ip: row.ip, lastSeenAt: row.lastSeenAt, userEmail: row.user.email }));
  },
  async findSessionsList(options) {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const rows = await db.userSession.findMany({
      where: {
        ...(options.userId ? { userId: options.userId } : {}),
        ...(options.includeEnded
          ? { OR: [{ revokedAt: null, expiresAt: { gt: now } }, { lastSeenAt: { gte: weekAgo } }] }
          : { revokedAt: null, expiresAt: { gt: now } }),
      },
      orderBy: { lastSeenAt: "desc" },
      take: options.take,
      select: {
        id: true,
        userId: true,
        ip: true,
        browser: true,
        os: true,
        device: true,
        mfaVerified: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        revokedAt: true,
        revokeReason: true,
        user: { select: { email: true, name: true } },
      },
    });
    return rows.map(({ user, ...row }) => ({ ...row, userEmail: user.email, userName: user.name }));
  },

  // -- rbac --
  async findAllRolePermissions() {
    const rows = await db.rolePermission.findMany({ select: { role: true, permission: true } });
    return rows.map((row) => ({ ...row, role: row.role as RoleName }));
  },
  async deleteRolePermissions(roles, tx) {
    // roles/rows come in as the adapter interface's generic RoleName (a
    // plain `string`); every value that ever reaches here does come from
    // this app's own Role enum (createRbac is bound to it — see
    // lib/auth/kit-config.ts), so this boundary cast is safe.
    await client(tx).rolePermission.deleteMany({ where: { role: { in: roles as Role[] } } });
  },
  async createRolePermissions(rows, tx) {
    await client(tx).rolePermission.createMany({ data: rows as Prisma.RolePermissionCreateManyInput[] });
  },

  // -- mfa --
  async findOpenMfaChallenges(userId, purpose, now) {
    return db.mfaChallenge.findMany({
      where: { userId, purpose, consumedAt: null, expiresAt: { gt: now } },
      select: { attempts: true, expiresAt: true },
    });
  },
  async expireOpenMfaChallenges(userId, purpose, now, tx) {
    await client(tx).mfaChallenge.updateMany({
      where: { userId, purpose, consumedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
  },
  async createMfaChallenge(input, tx) {
    await client(tx).mfaChallenge.create({
      data: {
        id: input.id,
        userId: input.userId,
        purpose: input.purpose,
        codeHash: input.codeHash,
        attempts: input.attempts,
        expiresAt: input.expiresAt,
      },
    });
  },
  async expireMfaChallengeById(id, when) {
    await db.mfaChallenge.updateMany({ where: { id }, data: { expiresAt: when } });
  },
  async findMfaChallengeById(id, userId, purpose) {
    const row = await db.mfaChallenge.findFirst({ where: { id, userId, purpose } });
    return row ? { ...row, purpose: row.purpose as MfaPurpose } : null;
  },
  async incrementMfaAttempts(id, now, maxAttempts) {
    return db.mfaChallenge.updateMany({
      where: { id, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: maxAttempts } },
      data: { attempts: { increment: 1 } },
    });
  },
  async findMfaChallengeAttempts(id) {
    return db.mfaChallenge.findUnique({ where: { id }, select: { attempts: true } });
  },
  async markMfaChallengeVerified(id, when) {
    await db.mfaChallenge.updateMany({ where: { id, verifiedAt: null }, data: { verifiedAt: when } });
  },
  async consumeMfaChallenge(input) {
    return db.mfaChallenge.updateMany({
      where: {
        id: input.id,
        userId: input.userId,
        purpose: input.purpose,
        consumedAt: null,
        verifiedAt: { gte: new Date(input.now.getTime() - input.verifiedWindowSeconds * 1000) },
        expiresAt: { gt: input.now },
      },
      data: { consumedAt: input.now },
    });
  },
  async findMfaChallengeOwner(id, purpose) {
    return db.mfaChallenge.findFirst({
      where: { id, purpose, consumedAt: null },
      select: { userId: true, user: { select: { id: true, email: true, name: true, disabledAt: true } } },
    });
  },
};
