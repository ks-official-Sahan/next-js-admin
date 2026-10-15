import { and, asc, count, countDistinct, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";

import { auditLogs, authTokens, chatSessions, contentBlocks, inquiries, mfaChallenges, posts, userSessions } from "@/lib/db/schema";

import type { DailyCounts, DashboardPostStatus, DashboardRepo, MaintenanceRepo } from "../maintenance";
import { countRows, rawRows, type DbClient } from "./client";

/** Failed sign-ins and MFA checks counted by the dashboard's security card. */
const FAILED_AUTH_ACTIONS = ["auth.login.failure", "auth.mfa.failed"];

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
    async pruneSupersededBlocks(keep) {
      // Same window-function shape as pruneRevisions, per section; only
      // SUPERSEDED rows are candidates, so drafts and published rows always stay.
      const result = await client.execute(sql`
        DELETE FROM ${contentBlocks}
        WHERE id IN (
          SELECT id FROM (
            SELECT id, row_number() OVER (PARTITION BY "pageSlug", "sectionSlug" ORDER BY version DESC) AS rank
            FROM ${contentBlocks}
            WHERE status = 'SUPERSEDED'
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
    async activitySeries(days, hideActorRole) {
      const span = Math.min(Math.max(Math.trunc(days), 1), 90);
      const hide = hideActorRole ?? null;
      // One statement: each source table is scanned once from the window start,
      // then joined onto a zero-filled day series.
      const result = await client.execute(sql`
        WITH days AS (
          SELECT generate_series(
            date_trunc('day', now() AT TIME ZONE 'UTC') - make_interval(days => ${span - 1}::int),
            date_trunc('day', now() AT TIME ZONE 'UTC'),
            interval '1 day'
          ) AS day
        ),
        since AS (SELECT min(day) AS start FROM days),
        i AS (
          SELECT date_trunc('day', "createdAt") AS day, count(*)::int AS n
          FROM ${inquiries}, since WHERE "createdAt" >= since.start GROUP BY 1
        ),
        p AS (
          SELECT date_trunc('day', "publishedAt") AS day, count(*)::int AS n
          FROM ${posts}, since WHERE status = 'PUBLISHED' AND "publishedAt" >= since.start GROUP BY 1
        ),
        a AS (
          SELECT date_trunc('day', "createdAt") AS day, count(*)::int AS n
          FROM ${auditLogs}, since
          WHERE "createdAt" >= since.start AND (${hide}::text IS NULL OR "actorRole" IS DISTINCT FROM ${hide}::text)
          GROUP BY 1
        )
        SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
               COALESCE(i.n, 0) AS inquiries, COALESCE(p.n, 0) AS posts, COALESCE(a.n, 0) AS activity
        FROM days
        LEFT JOIN i ON i.day = days.day
        LEFT JOIN p ON p.day = days.day
        LEFT JOIN a ON a.day = days.day
        ORDER BY days.day`);
      return (rawRows(result) as { day: string; inquiries: unknown; posts: unknown; activity: unknown }[]).map(
        (row): DailyCounts => ({ day: row.day, inquiries: Number(row.inquiries), posts: Number(row.posts), activity: Number(row.activity) })
      );
    },
    recentActivity(limit, hideActorRole) {
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
        .where(hideActorRole ? or(isNull(auditLogs.actorRole), ne(auditLogs.actorRole, hideActorRole)) : undefined)
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
    async postStatusCounts() {
      const rows = await client.select({ status: posts.status, n: count() }).from(posts).groupBy(posts.status);
      const counts: Record<DashboardPostStatus, number> = { DRAFT: 0, SCHEDULED: 0, PUBLISHED: 0, ARCHIVED: 0 };
      for (const row of rows) counts[row.status] = row.n;
      return counts;
    },
    upcomingPosts(limit) {
      return client
        .select({ id: posts.id, title: posts.title, status: posts.status, publishAt: posts.publishAt, updatedAt: posts.updatedAt })
        .from(posts)
        .where(inArray(posts.status, ["SCHEDULED", "DRAFT"]))
        // The enum sorts in declaration order, so descending puts SCHEDULED first.
        .orderBy(desc(posts.status), sql`${posts.publishAt} ASC NULLS LAST`, desc(posts.updatedAt))
        .limit(limit);
    },
    newInquiries(limit) {
      return client
        .select({ id: inquiries.id, name: inquiries.name, topic: inquiries.topic, createdAt: inquiries.createdAt })
        .from(inquiries)
        .where(eq(inquiries.status, "NEW"))
        .orderBy(desc(inquiries.createdAt))
        .limit(limit);
    },
    async securityCounts(now, since) {
      const live = and(isNull(userSessions.revokedAt), gt(userSessions.expiresAt, now));
      const [[sessions], [failures]] = await Promise.all([
        client.select({ activeSessions: count(), activeUsers: countDistinct(userSessions.userId) }).from(userSessions).where(live),
        client
          .select({ n: count() })
          .from(auditLogs)
          .where(and(inArray(auditLogs.action, FAILED_AUTH_ACTIONS), gte(auditLogs.createdAt, since))),
      ]);
      return { activeSessions: sessions?.activeSessions ?? 0, activeUsers: sessions?.activeUsers ?? 0, failedSignIns: failures?.n ?? 0 };
    },
    countChatSessionsSince(since) {
      return countRows(client, chatSessions, gte(chatSessions.createdAt, since));
    },
  };
}
