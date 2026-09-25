"use server";

import { revalidatePath } from "next/cache";

import { authorizeAction } from "@/lib/actions/guard";
import type { ContentActionState } from "@/lib/actions/content-state";
import { hasPermission } from "@/lib/auth/dal";
import { invalidate } from "@/lib/cache/invalidate";
import { forContentPublish } from "@/lib/cache/plan";
import { isPageSlug } from "@/lib/cache/tags";
import { getDefinition } from "@/lib/cms/registry";
import { discardDraft, publishDraft, restoreVersion, saveDraft, type Failure } from "@/lib/cms/service";
import type { SectionDefinition } from "@/lib/cms/types";

// The four changes an editor makes to a section. Each one authorizes first (a
// Server Function is a public endpoint), finds the section in the registry,
// checks the section's own permission, and lets lib/cms/service.ts validate the
// data and write the audit row. Only a publish touches the public cache
// (design notes, sections 5.4 and 8).

const MAX_PAYLOAD = 100_000;

type Access =
  | { ok: true; user: { id: string; email: string }; definition: SectionDefinition<unknown> }
  | { ok: false; state: ContentActionState };

const refuse = (error: string): ContentActionState => ({ ok: false, message: null, error });

async function access(formData: FormData, permission: "edit" | "publish" | "both"): Promise<Access> {
  const signedIn = await authorizeAction(null);
  if (!signedIn.ok) return { ok: false, state: refuse(signedIn.error) };

  const page = String(formData.get("page") ?? "");
  const section = String(formData.get("section") ?? "");
  const definition = getDefinition(page, section);
  if (!definition) return { ok: false, state: refuse("That section does not exist.") };

  const needed =
    permission === "edit"
      ? [definition.editPermission]
      : permission === "publish"
        ? [definition.publishPermission]
        : [definition.editPermission, definition.publishPermission];
  if (!needed.every(function (key) { return hasPermission(signedIn.user, key); })) {
    return { ok: false, state: refuse("You do not have permission to do that.") };
  }

  return { ok: true, user: signedIn.user, definition };
}

const baseOf = (formData: FormData): string | null => {
  const value = formData.get("base");
  return typeof value === "string" && value.length > 0 ? value : null;
};

function payloadOf(formData: FormData): { ok: true; data: unknown } | { ok: false; state: ContentActionState } {
  const raw = formData.get("payload");
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_PAYLOAD) {
    return { ok: false, state: refuse("The form data is missing or too large.") };
  }
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch {
    return { ok: false, state: refuse("The form data could not be read.") };
  }
}

function failed(result: Failure): ContentActionState {
  return {
    ok: false,
    message: null,
    error: result.message,
    ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}),
    ...(result.code === "conflict" ? { conflict: true } : {}),
  };
}

export async function saveDraftAction(_previous: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const allowed = await access(formData, "edit");
  if (!allowed.ok) return allowed.state;
  const payload = payloadOf(formData);
  if (!payload.ok) return payload.state;

  const result = await saveDraft({
    page: allowed.definition.page,
    key: allowed.definition.key,
    data: payload.data,
    base: baseOf(formData),
    actor: allowed.user,
  });
  if (!result.ok) return failed(result);

  revalidatePath(`/admin/content/${allowed.definition.page}`);
  return {
    ok: true,
    message: "Draft saved. Visitors do not see it until it is published.",
    error: null,
    base: result.updatedAt,
  };
}

/** Saves what is on the screen and publishes it in one step, so nothing unsaved is left out. */
export async function publishAction(_previous: ContentActionState, formData: FormData): Promise<ContentActionState> {
  // Publishing saves what is on screen first, so it takes both permissions.
  const allowed = await access(formData, "both");
  if (!allowed.ok) return allowed.state;
  const payload = payloadOf(formData);
  if (!payload.ok) return payload.state;

  const { definition, user } = allowed;
  const saved = await saveDraft({
    page: definition.page,
    key: definition.key,
    data: payload.data,
    base: baseOf(formData),
    actor: user,
  });
  if (!saved.ok) return failed(saved);

  const note = String(formData.get("note") ?? "").slice(0, 200);
  // The draft that was just saved is the one to publish. If another save landed in
  // between, the publish is refused instead of putting someone else's text live.
  const published = await publishDraft({
    page: definition.page,
    key: definition.key,
    note,
    base: saved.updatedAt,
    actor: user,
  });
  if (!published.ok) return { ...failed(published), base: published.code === "conflict" ? null : saved.updatedAt };

  if (isPageSlug(definition.page)) {
    invalidate(forContentPublish(definition.page, { consumers: definition.consumers, section: definition.key }));
  }
  revalidatePath(`/admin/content/${definition.page}`);
  return {
    ok: true,
    message: "Published. The public pages update within moments.",
    error: null,
    base: null,
    published: true,
  };
}

// Restoring an old version is a publishing decision (design notes, section 9).
export async function restoreAction(_previous: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const allowed = await access(formData, "publish");
  if (!allowed.ok) return allowed.state;

  const version = Number.parseInt(String(formData.get("version") ?? ""), 10);
  if (!Number.isInteger(version) || version < 1) return refuse("Choose a version.");

  const result = await restoreVersion({
    page: allowed.definition.page,
    key: allowed.definition.key,
    version,
    base: baseOf(formData),
    actor: allowed.user,
  });
  if (!result.ok) return failed(result);

  revalidatePath(`/admin/content/${allowed.definition.page}`);
  return {
    ok: true,
    message: `Version ${version} is now your draft. Review it and publish when ready.`,
    error: null,
    base: result.updatedAt,
  };
}

export async function discardAction(_previous: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const allowed = await access(formData, "edit");
  if (!allowed.ok) return allowed.state;

  const result = await discardDraft({
    page: allowed.definition.page,
    key: allowed.definition.key,
    base: baseOf(formData),
    actor: allowed.user,
  });
  if (!result.ok) return failed(result);

  revalidatePath(`/admin/content/${allowed.definition.page}`);
  return { ok: true, message: "Draft discarded.", error: null, base: null };
}
