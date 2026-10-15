import "server-only";

import type { AnalyticsRange, SiteAnalytics } from "@sahan-sac/analytics-kit";

import { analytics } from "@/lib/analytics/store";
import { hiddenAuditRole } from "@/lib/auth/mask";
import type { RoleName } from "@/lib/auth/permissions";
import { cached } from "@/lib/cache/cached";
import { repos } from "@/lib/data";
import type { DailyCounts, DashboardInquiry, DashboardPost, DashboardPostStatus } from "@/lib/data/maintenance";
import { log } from "@/lib/log";

// Dashboard helper: queries for the admin dashboard widgets.
// All queries are tolerant of an unconfigured database (missing tables).
// Design notes, Step 16.

/**
 * Recent audit log entries the viewer may read (see lib/admin/audit-query.ts's auditScope).
 */
export async function getRecentActivity(viewer: { role: RoleName }, limit = 10) {
  try {
    return await repos.dashboard.recentActivity(limit, hiddenAuditRole(viewer));
  } catch {
    return [];
  }
}

export const SERIES_DAYS = 30;

export interface ActivitySeries {
  /** When these numbers were read from the database (they are cached for a minute). */
  generatedAt: string;
  days: DailyCounts[];
}

// One cached reader per audit visibility, because the Redis layer keys on
// keyParts alone: a developer's numbers never answer for anyone else.
const seriesReaders = new Map<string, () => Promise<ActivitySeries>>();

function seriesReader(hide: string | undefined) {
  const key = hide ?? "all";
  let reader = seriesReaders.get(key);
  if (!reader) {
    reader = cached(
      async () => ({ generatedAt: new Date().toISOString(), days: await repos.dashboard.activitySeries(SERIES_DAYS, hide) }),
      ["admin", "dashboard", "series", String(SERIES_DAYS), key],
      { tags: ["admin-dashboard"], revalidate: 60 }
    );
    seriesReaders.set(key, reader);
  }
  return reader;
}

/** Daily inquiries, published posts and audit activity for the last 30 days, or null without a database. */
export async function getActivitySeries(viewer: { role: RoleName }): Promise<ActivitySeries | null> {
  try {
    return await seriesReader(hiddenAuditRole(viewer))();
  } catch (error) {
    log.warn("dashboard series unavailable", { error: String(error) });
    return null;
  }
}

/**
 * Draft content blocks, and everything not yet public (draft blocks plus
 * draft or scheduled posts). Two counts run in parallel; the block count is
 * shared by both numbers instead of being queried twice.
 */
export async function getContentCounts(): Promise<{ drafts: number; unpublished: number }> {
  try {
    const [blocks, posts] = await Promise.all([
      repos.dashboard.countDraftBlocks(),
      repos.dashboard.countUnpublishedPosts(),
    ]);
    return { drafts: blocks, unpublished: blocks + posts };
  } catch {
    return { drafts: 0, unpublished: 0 };
  }
}

/**
 * Count new inquiries (status = NEW).
 */
export async function getNewInquiriesCount() {
  try {
    return await repos.dashboard.countNewInquiries();
  } catch {
    return 0;
  }
}

export type ProbeState = "up" | "down" | "off";
export interface Probe {
  state: ProbeState;
  /** Round trip in milliseconds, when the probe answered. */
  ms: number | null;
}

async function timed(probe: () => Promise<unknown>): Promise<{ ok: boolean; value: unknown; ms: number }> {
  const started = performance.now();
  try {
    const value = await probe();
    return { ok: true, value, ms: Math.round(performance.now() - started) };
  } catch {
    return { ok: false, value: null, ms: Math.round(performance.now() - started) };
  }
}

/**
 * Database and Redis, probed at once (the dashboard waits for the slower one,
 * not the sum), with round-trip times. Redis is probed directly, never through
 * the in-memory failover, so "up" means Upstash itself answered; "off" means
 * it is not configured and the app runs on the in-memory store.
 */
export async function getSystemHealth(): Promise<{ database: Probe; redis: Probe }> {
  const [database, redis] = await Promise.all([
    timed(() => repos.maintenance.ping()),
    timed(() => import("@/lib/cache/redis").then(({ pingRedis }) => pingRedis())),
  ]);
  return {
    database: { state: database.ok ? "up" : "down", ms: database.ok ? database.ms : null },
    redis: !redis.ok ? { state: "down", ms: null } : redis.value === false ? { state: "off", ms: null } : { state: "up", ms: redis.ms },
  };
}

/**
 * Get email configuration health.
 */
export async function getEmailHealth() {
  try {
    // The same typed env and rules as the settings screen (lib/email).
    const { getEmailHealth: emailHealthNow } = await import("@/lib/email");
    return emailHealthNow();
  } catch (err) {
    log.error("email health check failed", { error: String(err) });
    return null;
  }
}

/**
 * Get security status for the current user.
 */
export async function getUserSecurityStatus(userId: string) {
  try {
    const user = await repos.users.findSecurityStatus(userId);
    return user ?? { mfaEnabled: false, mustChangePassword: false };
  } catch {
    return { mfaEnabled: false, mustChangePassword: false };
  }
}

/** Posts per status plus the next scheduled posts and latest drafts, or null without a database. */
export async function getPostPipeline(limit = 5): Promise<{ counts: Record<DashboardPostStatus, number>; upcoming: DashboardPost[] } | null> {
  try {
    const [counts, upcoming] = await Promise.all([repos.dashboard.postStatusCounts(), repos.dashboard.upcomingPosts(limit)]);
    return { counts, upcoming };
  } catch {
    return null;
  }
}

/** Newest unanswered inquiries. */
export async function getNewInquiries(limit = 5): Promise<DashboardInquiry[]> {
  try {
    return await repos.dashboard.newInquiries(limit);
  } catch {
    return [];
  }
}

/** Live sessions and failed sign-ins in the last 7 days, or null without a database. */
export async function getSecurityCounts(now: number) {
  try {
    return await repos.dashboard.securityCounts(new Date(now), new Date(now - 7 * 86_400_000));
  } catch {
    return null;
  }
}

/** Chat conversations started in the last 7 days, or null without a database. */
export async function getRecentChatCount(now: number): Promise<number | null> {
  try {
    return await repos.dashboard.countChatSessionsSince(new Date(now - 7 * 86_400_000));
  } catch {
    return null;
  }
}

const analyticsReaders = new Map<AnalyticsRange, () => Promise<SiteAnalytics | null>>();

/**
 * Site analytics for the dashboard, cached for a minute per range (one
 * pipelined Redis read builds it). Null when Redis is not configured or does
 * not answer.
 */
export async function getSiteAnalytics(range: AnalyticsRange): Promise<SiteAnalytics | null> {
  let reader = analyticsReaders.get(range);
  if (!reader) {
    reader = cached(() => analytics.read(range), ["admin", "dashboard", "analytics", String(range)], { tags: ["admin-dashboard"], revalidate: 60 });
    analyticsReaders.set(range, reader);
  }
  try {
    return await reader();
  } catch (error) {
    log.warn("site analytics unavailable", { error: String(error) });
    return null;
  }
}
