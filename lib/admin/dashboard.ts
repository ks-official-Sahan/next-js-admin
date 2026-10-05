import "server-only";

import { repos } from "@/lib/data";
import { log } from "@/lib/log";

// Dashboard helper: queries for the admin dashboard widgets.
// All queries are tolerant of an unconfigured database (missing tables).
// Design notes, Step 16.

/**
 * Get recent audit log entries (last 10).
 */
export async function getRecentActivity(limit = 10) {
  try {
    return await repos.dashboard.recentActivity(limit);
  } catch {
    return [];
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

/**
 * Get system health status: database connection, redis (if configured).
 */
export async function getSystemHealth() {
  // Both probes run at once: the dashboard waits for the slower one, not the sum.
  const [database, redis] = await Promise.allSettled([
    repos.maintenance.ping(),
    import("@/lib/cache/redis").then(({ kv }) => kv.get("health-check")),
  ]);
  return { database: database.status === "fulfilled", redis: redis.status === "fulfilled" };
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
