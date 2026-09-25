import "server-only";

import type { Prisma } from "@prisma/client";

import { audit, type AuditEvent } from "@/lib/admin/audit";
import { db } from "@/lib/db/prisma";
import { log } from "@/lib/log";

import { resolveSection } from "./merge";
import { getDefinition, sectionsOf, type CmsPage, type PageContent } from "./registry";
import type { SectionDefinition } from "./types";
import { findDraft, findPublished, issuePath, nextVersion, planSave, type BlockStatus } from "./versions";

// The database side of the CMS: reading a section for the editor, and the four
// changes an editor can make (save a draft, publish, restore, discard). Every
// change writes its audit row in the same transaction, validates the whole
// section against its schema before it reaches the database, and refuses to
// overwrite a draft that changed since the editor loaded it
// (design notes, sections 7 and 8).

export interface Actor {
  id: string;
  email: string;
}

export interface BlockRow {
  id: string;
  version: number;
  status: BlockStatus;
  data: unknown;
  note: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
  createdById: string | null;
  publishedById: string | null;
}

const blockSelect = {
  id: true,
  version: true,
  status: true,
  data: true,
  note: true,
  publishedAt: true,
  updatedAt: true,
  createdById: true,
  publishedById: true,
} as const;

const json = (value: unknown) => value as Prisma.InputJsonValue;

export type Failure = {
  ok: false;
  code: "not_found" | "invalid" | "conflict" | "nothing" | "failed";
  message: string;
  fieldErrors?: Record<string, string>;
};
export type Saved = { ok: true; version: number; updatedAt: string };

const fail = (code: Failure["code"], message: string, fieldErrors?: Record<string, string>): Failure => ({
  ok: false,
  code,
  message,
  ...(fieldErrors ? { fieldErrors } : {}),
});

const CONFLICT = "Someone else changed this section since you opened it. Reload to see their changes.";

/** A conflict inside a transaction aborts it with this. */
class Abort extends Error {
  constructor(readonly failure: Failure) {
    super(failure.message);
  }
}

function definitionOf(page: string, key: string): SectionDefinition<unknown> | Failure {
  return getDefinition(page, key) ?? fail("not_found", "That section does not exist.");
}

/** First message per field path, for showing next to the inputs. */
function fieldErrorsOf(error: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> }) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issuePath(issue.path) || "form";
    if (!(path in out)) out[path] = issue.message;
  }
  return out;
}

async function rowsOf(client: Prisma.TransactionClient | typeof db, page: string, key: string): Promise<BlockRow[]> {
  const rows = await client.contentBlock.findMany({
    where: { pageSlug: page, sectionSlug: key },
    orderBy: { version: "desc" },
    select: blockSelect,
  });
  return rows as BlockRow[];
}

// ─── Reading for the editor ──────────────────────────────────────────────────

export interface SectionSummary {
  key: string;
  label: string;
  description?: string;
  publishedVersion: number | null;
  publishedAt: string | null;
  hasDraft: boolean;
  draftUpdatedAt: string | null;
}

export async function loadPageSummary(page: CmsPage): Promise<SectionSummary[]> {
  const rows = (await db.contentBlock.findMany({
    where: { pageSlug: page, status: { in: ["DRAFT", "PUBLISHED"] } },
    select: { sectionSlug: true, status: true, version: true, publishedAt: true, updatedAt: true },
  })) as Array<{ sectionSlug: string; status: BlockStatus; version: number; publishedAt: Date | null; updatedAt: Date }>;

  return Object.values(sectionsOf(page)).map((definition) => {
    const mine = rows.filter((row) => row.sectionSlug === definition.key);
    const draft = mine.find((row) => row.status === "DRAFT");
    const published = mine.find((row) => row.status === "PUBLISHED");
    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      publishedVersion: published?.version ?? null,
      publishedAt: published?.publishedAt?.toISOString() ?? null,
      hasDraft: Boolean(draft),
      draftUpdatedAt: draft?.updatedAt.toISOString() ?? null,
    };
  });
}

export interface HistoryItem {
  version: number;
  status: BlockStatus;
  note: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface EditorSection {
  /** The complete section as the form starts: draft, else published, else defaults. */
  initial: unknown;
  /** ISO `updatedAt` of the draft that `initial` came from, or null. Sent back on save. */
  base: string | null;
  source: "draft" | "published" | "defaults";
  publishedVersion: number | null;
  history: HistoryItem[];
  /** A stored block that no longer validates was ignored and the defaults are shown. */
  ignoredReason?: string;
}

export async function loadEditorSection(definition: SectionDefinition<unknown>): Promise<EditorSection> {
  const rows = await rowsOf(db, definition.page, definition.key);
  const draft = findDraft(rows);
  const published = findPublished(rows);
  const stored = draft?.data ?? published?.data;
  const resolved = resolveSection(definition.schema, definition.defaults(), stored);

  return {
    initial: resolved.data,
    base: draft?.updatedAt.toISOString() ?? null,
    source: resolved.fromStore ? (draft ? "draft" : "published") : "defaults",
    publishedVersion: published?.version ?? null,
    history: rows
      .filter((row) => row.status !== "DRAFT")
      .slice(0, 20)
      .map((row) => ({
        version: row.version,
        status: row.status,
        note: row.note,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
      })),
    ...(resolved.ignored ? { ignoredReason: resolved.ignored } : {}),
  };
}

/** Draft over published over defaults for every section of a page: the preview. */
export async function loadPreviewContent<P extends CmsPage>(page: P): Promise<PageContent<P>> {
  const rows = (await db.contentBlock.findMany({
    where: { pageSlug: page, status: { in: ["DRAFT", "PUBLISHED"] } },
    select: { sectionSlug: true, status: true, data: true },
  })) as Array<{ sectionSlug: string; status: BlockStatus; data: unknown }>;

  const out: Record<string, unknown> = {};
  for (const [key, definition] of Object.entries(sectionsOf(page))) {
    const mine = rows.filter((row) => row.sectionSlug === key);
    const stored = (mine.find((row) => row.status === "DRAFT") ?? mine.find((row) => row.status === "PUBLISHED"))?.data;
    out[key] = resolveSection(definition.schema, definition.defaults(), stored).data;
  }
  return out as PageContent<P>;
}

// ─── Changes ─────────────────────────────────────────────────────────────────

async function run<T extends { ok: true }>(work: () => Promise<T>): Promise<T | Failure> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Abort) return error.failure;
    // Two people creating the first draft at once: the unique version index refuses the second.
    if ((error as { code?: string })?.code === "P2002") return fail("conflict", CONFLICT);
    log.error("cms change failed", { error: error instanceof Error ? error.message : String(error) });
    return fail("failed", "Something went wrong. Nothing was changed.");
  }
}

const auditFor = (
  action: string,
  actor: Actor,
  definition: SectionDefinition<unknown>,
  extra: Pick<AuditEvent, "before" | "after" | "meta">
): AuditEvent => ({
  action,
  actor,
  entityType: "ContentBlock",
  entityId: `${definition.page}.${definition.key}`,
  ...extra,
});

/** Creates the draft or updates it in place, after checking nobody else changed it. */
async function writeDraft(
  tx: Prisma.TransactionClient,
  definition: SectionDefinition<unknown>,
  data: unknown,
  base: string | null,
  actor: Actor
): Promise<{ version: number; updatedAt: Date; before: unknown }> {
  const rows = await rowsOf(tx, definition.page, definition.key);
  const action = planSave(rows, base);
  if (action === "conflict") throw new Abort(fail("conflict", CONFLICT));

  const draft = findDraft(rows);
  const before = draft?.data ?? findPublished(rows)?.data ?? definition.defaults();

  if (action === "update-draft" && draft) {
    // Conditional on the timestamp the editor saw, so a save that lands between the
    // check above and this write still cannot overwrite the other person's draft.
    const updated = await tx.contentBlock.updateMany({
      where: { id: draft.id, status: "DRAFT", updatedAt: draft.updatedAt },
      data: { data: json(data) },
    });
    if (updated.count !== 1) throw new Abort(fail("conflict", CONFLICT));
    const fresh = await tx.contentBlock.findUniqueOrThrow({ where: { id: draft.id }, select: { updatedAt: true } });
    return { version: draft.version, updatedAt: fresh.updatedAt, before };
  }

  const created = await tx.contentBlock.create({
    data: {
      pageSlug: definition.page,
      sectionSlug: definition.key,
      version: nextVersion(rows),
      data: json(data),
      status: "DRAFT",
      createdById: actor.id,
    },
    select: { version: true, updatedAt: true },
  });
  return { ...created, before };
}

export async function saveDraft(input: {
  page: string;
  key: string;
  data: unknown;
  base: string | null;
  actor: Actor;
}): Promise<Saved | Failure> {
  const definition = definitionOf(input.page, input.key);
  if ("ok" in definition) return definition;

  const parsed = definition.schema.safeParse(input.data);
  if (!parsed.success) return fail("invalid", "Some fields need attention.", fieldErrorsOf(parsed.error));

  return run(() =>
    db.$transaction(async (tx) => {
      const written = await writeDraft(tx, definition, parsed.data, input.base, input.actor);
      await audit(
        auditFor("content.draft_saved", input.actor, definition, {
          before: written.before,
          after: parsed.data,
          meta: { version: written.version },
        }),
        tx
      );
      return { ok: true as const, version: written.version, updatedAt: written.updatedAt.toISOString() };
    })
  );
}

export async function publishDraft(input: {
  page: string;
  key: string;
  note?: string;
  /** `updatedAt` of the draft the caller means to publish. A different draft is a conflict. */
  base?: string | null;
  actor: Actor;
}): Promise<Saved | Failure> {
  const definition = definitionOf(input.page, input.key);
  if ("ok" in definition) return definition;

  return run(() =>
    db.$transaction(async (tx) => {
      const rows = await rowsOf(tx, definition.page, definition.key);
      const draft = findDraft(rows);
      if (!draft) throw new Abort(fail("nothing", "There is no draft to publish."));
      if (input.base !== undefined && draft.updatedAt.toISOString() !== input.base) {
        throw new Abort(fail("conflict", CONFLICT));
      }

      // The schema may have been tightened since the draft was saved.
      const parsed = definition.schema.safeParse(draft.data);
      if (!parsed.success) {
        throw new Abort(fail("invalid", "The draft no longer passes validation.", fieldErrorsOf(parsed.error)));
      }

      const previous = findPublished(rows);
      if (previous) {
        await tx.contentBlock.updateMany({ where: { id: previous.id, status: "PUBLISHED" }, data: { status: "SUPERSEDED" } });
      }
      const promoted = await tx.contentBlock.updateMany({
        where: { id: draft.id, status: "DRAFT", updatedAt: draft.updatedAt },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          publishedById: input.actor.id,
          note: input.note?.trim() || null,
        },
      });
      if (promoted.count !== 1) throw new Abort(fail("conflict", CONFLICT));

      await audit(
        auditFor("content.published", input.actor, definition, {
          before: previous?.data ?? definition.defaults(),
          after: parsed.data,
          meta: {
            version: draft.version,
            previousVersion: previous?.version ?? null,
            note: input.note?.trim() || undefined,
          },
        }),
        tx
      );
      const fresh = await tx.contentBlock.findUniqueOrThrow({ where: { id: draft.id }, select: { updatedAt: true } });
      return { ok: true as const, version: draft.version, updatedAt: fresh.updatedAt.toISOString() };
    })
  );
}

/** Copies an older version into the draft. Publishing it is a separate step. */
export async function restoreVersion(input: {
  page: string;
  key: string;
  version: number;
  base: string | null;
  actor: Actor;
}): Promise<Saved | Failure> {
  const definition = definitionOf(input.page, input.key);
  if ("ok" in definition) return definition;

  return run(() =>
    db.$transaction(async (tx) => {
      const rows = await rowsOf(tx, definition.page, definition.key);
      const source = rows.find((row) => row.version === input.version && row.status !== "DRAFT");
      if (!source) throw new Abort(fail("not_found", "That version does not exist."));

      const parsed = definition.schema.safeParse(source.data);
      if (!parsed.success) {
        throw new Abort(
          fail("invalid", "That version no longer passes validation and cannot be restored.", fieldErrorsOf(parsed.error))
        );
      }

      const written = await writeDraft(tx, definition, parsed.data, input.base, input.actor);
      await audit(
        auditFor("content.restored", input.actor, definition, {
          before: written.before,
          after: parsed.data,
          meta: { restoredVersion: input.version, draftVersion: written.version },
        }),
        tx
      );
      return { ok: true as const, version: written.version, updatedAt: written.updatedAt.toISOString() };
    })
  );
}

export async function discardDraft(input: {
  page: string;
  key: string;
  base: string | null;
  actor: Actor;
}): Promise<{ ok: true } | Failure> {
  const definition = definitionOf(input.page, input.key);
  if ("ok" in definition) return definition;

  const result = await run(() =>
    db.$transaction(async (tx) => {
      const rows = await rowsOf(tx, definition.page, definition.key);
      const draft = findDraft(rows);
      if (!draft) throw new Abort(fail("nothing", "There is no draft to discard."));
      if (input.base === null || draft.updatedAt.toISOString() !== input.base) {
        throw new Abort(fail("conflict", CONFLICT));
      }
      const removed = await tx.contentBlock.deleteMany({
        where: { id: draft.id, status: "DRAFT", updatedAt: draft.updatedAt },
      });
      if (removed.count !== 1) throw new Abort(fail("conflict", CONFLICT));

      await audit(
        auditFor("content.draft_discarded", input.actor, definition, {
          before: draft.data,
          after: findPublished(rows)?.data ?? definition.defaults(),
          meta: { version: draft.version },
        }),
        tx
      );
      return { ok: true as const };
    })
  );
  return result;
}
