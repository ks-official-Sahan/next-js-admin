import type { DashboardRepo, MaintenanceRepo } from "../maintenance";
import type { DbClient } from "./client";

export function maintenanceRepo(client: DbClient): MaintenanceRepo {
  return {
    async publishDuePosts(now) {
      const { count } = await client.post.updateMany({
        where: { status: "SCHEDULED", publishAt: { lte: now } },
        data: { status: "PUBLISHED", publishedAt: now },
      });
      return count;
    },
    async deleteEndedSessions(cutoff) {
      const { count } = await client.userSession.deleteMany({
        where: { OR: [{ expiresAt: { lte: cutoff } }, { revokedAt: { lte: cutoff } }] },
      });
      return count;
    },
    async deleteExpiredAuthTokens(cutoff) {
      return (await client.authToken.deleteMany({ where: { expiresAt: { lte: cutoff } } })).count;
    },
    async deleteExpiredMfaChallenges(cutoff) {
      return (await client.mfaChallenge.deleteMany({ where: { expiresAt: { lte: cutoff } } })).count;
    },
    async oldestAuditIdsBefore(cutoff, take) {
      const rows = await client.auditLog.findMany({
        where: { createdAt: { lt: cutoff } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
        take,
      });
      return rows.map((row) => row.id);
    },
    async deleteAuditRows(ids) {
      if (ids.length === 0) return 0;
      return (await client.auditLog.deleteMany({ where: { id: { in: ids } } })).count;
    },
    pruneRevisions(keep) {
      // A window function ranks each post's revisions newest first; everything
      // past the cap goes, however many posts have history.
      return client.$executeRaw`
        DELETE FROM post_revisions
        WHERE id IN (
          SELECT id FROM (
            SELECT id, row_number() OVER (PARTITION BY "postId" ORDER BY "createdAt" DESC) AS rank
            FROM post_revisions
          ) ranked
          WHERE ranked.rank > ${keep}
        )`;
    },
    async ping() {
      await client.$queryRaw`SELECT 1`;
    },
  };
}

export function dashboardRepo(client: DbClient): DashboardRepo {
  return {
    recentActivity(limit, hideActorRole) {
      return client.auditLog.findMany({
        where: hideActorRole ? { OR: [{ actorRole: null }, { actorRole: { not: hideActorRole } }] } : undefined,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: { id: true, action: true, createdAt: true, actorEmail: true, entityType: true, entityId: true },
      });
    },
    countDraftBlocks() {
      return client.contentBlock.count({ where: { status: "DRAFT" } });
    },
    countUnpublishedPosts() {
      return client.post.count({ where: { status: { in: ["DRAFT", "SCHEDULED"] } } });
    },
    countNewInquiries() {
      return client.inquiry.count({ where: { status: "NEW" } });
    },
  };
}
