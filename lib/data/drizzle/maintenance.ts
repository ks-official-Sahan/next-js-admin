import { and, asc, desc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";

import { auditLogs, authTokens, contentBlocks, inquiries, mfaChallenges, posts, userSessions } from "@/lib/db/schema";

import type { DashboardRepo, MaintenanceRepo } from "../maintenance";
import { countRows, rawRows, type DbClient } from "./client";

export function maintenanceRepo(client: DbClient): MaintenanceRepo {
  return {
    async publishDuePosts(now) {
      const rows = await client
        .update(posts)
        .set({ status: "PUBLISHED", publishedAt: now })
        .where(and(eq(posts.status, "SCHEDULED"), lte(posts.publishAt, now)))
        .returning({ id: posts.id });
      return rows.length;
    },
    async deleteEndedSessions(cutoff) {
      const rows = await client
        .delete(userSessions)
        .where(or(lte(userSessions.expiresAt, cutoff), lte(userSessions.revokedAt, cutoff)))
        .returning({ id: userSessions.id });
      return rows.length;
    },
    async deleteExpiredAuthTokens(cutoff) {
      return (await client.delete(authTokens).where(lte(authTokens.expiresAt, cutoff)).returning({ id: authTokens.id })).length;
    },
    async deleteExpiredMfaChallenges(cutoff) {
      return (await client.delete(mfaChallenges).where(lte(mfaChallenges.expiresAt, cutoff)).returning({ id: mfaChallenges.id })).length;
    },
    async oldestAuditIdsBefore(cutoff, take) {
      const rows = await client
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(lt(auditLogs.createdAt, cutoff))
        .orderBy(asc(auditLogs.createdAt))
        .limit(take);
      return rows.map((row) => row.id);
    },
    async deleteAuditRows(ids) {
      if (ids.length === 0) return 0;
      return (await client.delete(auditLogs).where(inArray(auditLogs.id, ids)).returning({ id: auditLogs.id })).length;
    },
    async pruneRevisions(keep) {
      // A window function ranks each post's revisions newest first; everything
      // past the cap goes, however many posts have history.
      const result = await client.execute(sql`
        DELETE FROM post_revisions
        WHERE id IN (
          SELECT id FROM (
            SELECT id, row_number() OVER (PARTITION BY "postId" ORDER BY "createdAt" DESC) AS rank
            FROM post_revisions
          ) ranked
          WHERE ranked.rank > ${keep}
        )
        RETURNING id`);
      return rawRows(result).length;
    },
    async ping() {
      await client.execute(sql`SELECT 1`);
    },
  };
}

export function dashboardRepo(client: DbClient): DashboardRepo {
  return {
    recentActivity(limit) {
      return client
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          createdAt: auditLogs.createdAt,
          actorEmail: auditLogs.actorEmail,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
        })
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit);
    },
    countDraftBlocks() {
      return countRows(client, contentBlocks, eq(contentBlocks.status, "DRAFT"));
    },
    countUnpublishedPosts() {
      return countRows(client, posts, inArray(posts.status, ["DRAFT", "SCHEDULED"]));
    },
    countNewInquiries() {
      return countRows(client, inquiries, eq(inquiries.status, "NEW"));
    },
  };
}
