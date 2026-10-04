// Scheduled housekeeping and health pings. Each method is one bounded
// statement; the jobs in lib/cron/jobs.ts add logging, budgets and caching.

export interface MaintenanceRepo {
  /** SCHEDULED posts whose publishAt <= now become PUBLISHED; returns how many. */
  publishDuePosts(now: Date): Promise<number>;
  /** Sessions that expired, or were revoked, at or before `cutoff`. */
  deleteEndedSessions(cutoff: Date): Promise<number>;
  /** Invite, reset and email-change links that expired at or before `cutoff`. */
  deleteExpiredAuthTokens(cutoff: Date): Promise<number>;
  /** MFA challenges that expired at or before `cutoff`. */
  deleteExpiredMfaChallenges(cutoff: Date): Promise<number>;
  /** Ids of audit rows created before `cutoff`, oldest first. */
  oldestAuditIdsBefore(cutoff: Date, take: number): Promise<string[]>;
  deleteAuditRows(ids: string[]): Promise<number>;
  /** Keeps each post's newest `keep` revisions, in one statement; returns rows deleted. */
  pruneRevisions(keep: number): Promise<number>;
  /** Throws when the database cannot answer. */
  ping(): Promise<void>;
}

export interface DashboardActivity {
  id: string;
  action: string;
  createdAt: Date;
  actorEmail: string | null;
  entityType: string;
  entityId: string | null;
}

export interface DashboardRepo {
  recentActivity(limit: number): Promise<DashboardActivity[]>;
  countDraftBlocks(): Promise<number>;
  /** DRAFT and SCHEDULED posts. */
  countUnpublishedPosts(): Promise<number>;
  countNewInquiries(): Promise<number>;
}
