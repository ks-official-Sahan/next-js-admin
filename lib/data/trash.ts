import type { TrashEntity } from "@/lib/trash/policy";

export interface TrashRow {
  id: string;
  entityType: TrashEntity;
  entityId: string;
  label: string;
  deletedById: string | null;
  deletedAt: Date;
}

export interface TrashItem extends TrashRow {
  data: unknown;
}

export interface NewTrashItem {
  entityType: TrashEntity;
  entityId: string;
  label: string;
  data: unknown;
  deletedById: string | null;
}

/** Thrown by restore when the snapshot cannot go back as it was (its group is gone). */
export class TrashRestoreError extends Error {}

export interface TrashRepo {
  /** Stores snapshots, replacing an older one of the same item. */
  put(items: NewTrashItem[]): Promise<void>;
  /** Posts with their revisions and slug redirects, as trash snapshots. */
  snapshotPosts(ids: string[]): Promise<Array<{ id: string; label: string; data: unknown }>>;
  /** Newest first. */
  list(take: number): Promise<TrashRow[]>;
  find(id: string): Promise<TrashItem | null>;
  /** Deletes items by id; returns how many went. */
  remove(ids: string[]): Promise<number>;
  /** Oldest items deleted before `cutoff`. */
  expired(cutoff: Date, take: number): Promise<TrashItem[]>;
  /**
   * Re-inserts a snapshot with its original ids. Throws UniqueViolation when
   * a slug or key it needs is taken, TrashRestoreError when its group is gone.
   */
  restore(entityType: TrashEntity, data: unknown): Promise<void>;
}
