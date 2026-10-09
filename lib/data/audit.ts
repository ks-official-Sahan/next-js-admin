/** One audit_logs row, already redacted (see lib/admin/audit.ts). */
export interface AuditRow {
  action: string;
  actorId: string | null;
  actorEmail: string | null;
  /** The actor's role when the row was written (lib/admin/audit.ts). */
  actorRole: string | null;
  entityType: string;
  entityId: string | null;
  before?: unknown;
  after?: unknown;
  meta?: unknown;
  ip: string | null;
  userAgent: string | null;
}

/** A stored audit row, as the audit screen and export read it. */
export interface AuditEntry extends AuditRow {
  id: string;
  createdAt: Date;
}

export interface AuditFilters {
  /** Part of the actor's email (any case), or an exact actor id. */
  actor?: string;
  /** An exact action, or a prefix ending in `*`, for example `auth.*`. */
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
  /** Leave out rows written by this role (the snapshot). Set by the server from the viewer, never from the URL. */
  hideActorRole?: string;
}

/** Keyset position: the last row of the previous page. */
export interface AuditCursor {
  createdAt: Date;
  id: string;
}

export interface AuditRepo {
  create(row: AuditRow): Promise<void>;
  /** One insert for many rows, for bulk actions inside a transaction. */
  createMany(rows: AuditRow[]): Promise<void>;
  /** Up to `take` rows after `cursor`, newest first (createdAt, then id, descending). */
  page(filters: AuditFilters, cursor: AuditCursor | null, take: number): Promise<AuditEntry[]>;
  /** Distinct action names, alphabetical, of the rows a viewer may see. */
  actionNames(limit: number, hideActorRole?: string): Promise<string[]>;
}
