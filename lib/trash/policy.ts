import type { Permission } from "@/lib/auth/permissions";

// What the trash holds and who may act on each kind of item. Pure, so the
// rules are unit tested and shared by the actions, the page and the cron.

export const TRASH_ENTITIES = ["Post", "MediaAsset"] as const;
export type TrashEntity = (typeof TRASH_ENTITIES)[number];

/** Days a deleted item stays restorable before the housekeeping cron purges it. */
export const TRASH_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The permission that deleted this kind of item is the one that restores or purges it. */
export const TRASH_PERMISSION: Record<TrashEntity, Permission> = {
  Post: "deleteBlog",
  MediaAsset: "deleteMedia",
};

export const TRASH_LABEL: Record<TrashEntity, string> = {
  Post: "Post",
  MediaAsset: "Media",
};

export function isTrashEntity(value: string): value is TrashEntity {
  return (TRASH_ENTITIES as readonly string[]).includes(value);
}

/** Items deleted before this instant are past keeping. */
export function trashCutoff(now = Date.now()): Date {
  return new Date(now - TRASH_DAYS * DAY_MS);
}

export function daysLeft(deletedAt: Date, now = Date.now()): number {
  return Math.max(0, Math.ceil((deletedAt.getTime() + TRASH_DAYS * DAY_MS - now) / DAY_MS));
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/**
 * A snapshot back from JSON: the ISO strings of every key ending in "At"
 * become Dates again, at any depth, so a row restores with its timestamps.
 */
export function reviveDates<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => reviveDates(item)) as T;
  if (value === null || typeof value !== "object" || value instanceof Date) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = key.endsWith("At") && typeof item === "string" && ISO_INSTANT.test(item) ? new Date(item) : reviveDates(item);
  }
  return out as T;
}
