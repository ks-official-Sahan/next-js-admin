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
  /** Keeps each section's newest `keep` superseded versions (drafts and published rows always stay); returns rows deleted. */
  pruneSupersededBlocks(keep: number): Promise<number>;
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

/** One UTC day of dashboard counts; `day` is YYYY-MM-DD. */
export interface DailyCounts {
  day: string;
  inquiries: number;
  /** Posts that went public that day. */
  posts: number;
  /** Audit rows written that day (the viewer's hidden role left out). */
  activity: number;
}

export interface DashboardRepo {
  /**
   * The last `days` UTC days, oldest first and zero-filled, in one grouped
   * statement (each source table is read once through its createdAt /
   * publishedAt index, never once per day).
   */
  activitySeries(days: number, hideActorRole?: string): Promise<DailyCounts[]>;
  /** Newest audit rows, leaving out those written by `hideActorRole`. */
  recentActivity(limit: number, hideActorRole?: string): Promise<DashboardActivity[]>;
  countDraftBlocks(): Promise<number>;
  /** DRAFT and SCHEDULED posts. */
  countUnpublishedPosts(): Promise<number>;
  countNewInquiries(): Promise<number>;
  /** Posts per status, in one grouped statement (every status present, zero when none). */
  postStatusCounts(): Promise<Record<DashboardPostStatus, number>>;
  /** Scheduled posts (soonest first), then drafts (last edited first). */
  upcomingPosts(limit: number): Promise<DashboardPost[]>;
  /** Newest inquiries still marked NEW. */
  newInquiries(limit: number): Promise<DashboardInquiry[]>;
  /** Live (unrevoked, unexpired) sessions and failed sign-ins or MFA checks since `since`. */
  securityCounts(now: Date, since: Date): Promise<{ activeSessions: number; activeUsers: number; failedSignIns: number }>;
  /** Chat conversations started since `since`. */
  countChatSessionsSince(since: Date): Promise<number>;
}

export type DashboardPostStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";

export interface DashboardPost {
  id: string;
  title: string;
  status: DashboardPostStatus;
  publishAt: Date | null;
  updatedAt: Date;
}

export interface DashboardInquiry {
  id: string;
  name: string;
  topic: string | null;
  createdAt: Date;
}
