"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState, type FormEvent } from "react";

import { discardAction, publishAction, restoreAction, saveDraftAction } from "@/lib/actions/content";
import { idleContentState, type ContentActionState } from "@/lib/actions/content-state";
import { toast } from "@/lib/admin/toast";
import { validateValues } from "@/lib/cms/field-model";
import type { FieldDescriptor } from "@/lib/cms/types";
import { cn } from "@/lib/utils";

import { buttonVariants, fieldClass } from "../ui/styles";
import FieldRenderer, { inputId } from "./FieldRenderer";

// The form for one section. Values live here as plain JSON and travel to the
// Server Functions in one hidden `payload` field; the server validates them with
// the section's zod schema, so nothing that fails there reaches the database.
// The checks in lib/cms/field-model.ts only give quick feedback while typing.

export interface EditorHistoryItem {
  version: number;
  status: "DRAFT" | "PUBLISHED" | "SUPERSEDED";
  note: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

interface Props {
  page: string;
  section: string;
  label: string;
  fields: FieldDescriptor[];
  initial: unknown;
  base: string | null;
  source: "draft" | "published" | "defaults";
  publishedVersion: number | null;
  history: EditorHistoryItem[];
  ignoredReason?: string;
  canEdit: boolean;
  canPublish: boolean;
  previewHref: string;
}

const SOURCE_TEXT = {
  draft: "You have a saved draft. Visitors do not see it yet.",
  published: "Showing the published version.",
  defaults: "Nothing saved yet. Showing what the site has today.",
} as const;

const stamp = (value: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";

export default function SectionEditor(props: Props) {
  const { page, section, fields, canEdit, canPublish } = props;
  const router = useRouter();
  const idPrefix = `cms-${page}-${section}`;

  const [values, setValues] = useState<unknown>(props.initial);
  const [base, setBase] = useState<string | null>(props.base);
  const [hasDraft, setHasDraft] = useState(props.source === "draft");
  const [saved, setSaved] = useState(() => JSON.stringify(props.initial));
  const [publishedVersion, setPublishedVersion] = useState(props.publishedVersion);
  const [showProblems, setShowProblems] = useState(false);
  const [note, setNote] = useState("");
  const [version, setVersion] = useState(String(props.history[0]?.version ?? ""));
  const [conflict, setConflict] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  const payload = useMemo(() => JSON.stringify(values), [values]);
  const dirty = payload !== saved;
  const problems = useMemo(() => validateValues(fields, values), [fields, values]);
  const problemKeys = Object.keys(problems);
  // Quick checks win over what the server said last time about the same field.
  const errors = { ...serverErrors, ...problems };

  // Each action reports its result from inside the action, after the server has
  // answered, so nothing has to react to a state change in an effect.
  function run(
    action: (previous: ContentActionState, formData: FormData) => Promise<ContentActionState>,
    onDone?: (state: ContentActionState, formData: FormData) => void
  ) {
    return async (previous: ContentActionState, formData: FormData) => {
      const state = await action(previous, formData);
      if (state.message) toast.success(state.message);
      if (state.error) toast.error(state.error);
      if (state.conflict) setConflict(true);
      // A publish that failed after its save leaves a newer draft behind: keep its base.
      if (!state.ok && state.base) setBase(state.base);
      setServerErrors(state.fieldErrors ?? {});
      if (state.ok) onDone?.(state, formData);
      return state;
    };
  }

  const [, save, saving] = useActionState(
    run(saveDraftAction, (state, formData) => {
      setSaved(String(formData.get("payload")));
      setBase(state.base ?? null);
      setHasDraft(true);
      setShowProblems(false);
    }),
    idleContentState
  );
  const [, publish, publishing] = useActionState(
    run(publishAction, (_state, formData) => {
      setSaved(String(formData.get("payload")));
      setBase(null);
      setHasDraft(false);
      setShowProblems(false);
      setNote("");
      setPublishedVersion((current) => (current ?? 0) + 1);
      router.refresh();
    }),
    idleContentState
  );
  // A restored or discarded draft changes what the form should show, so start over.
  const [, restore, restoring] = useActionState(
    run(restoreAction, () => window.location.reload()),
    idleContentState
  );
  const [, discard, discarding] = useActionState(
    run(discardAction, () => window.location.reload()),
    idleContentState
  );
  const busy = saving || publishing || restoring || discarding;

  // A browser prompt when the tab would close with unsaved edits, and a confirm
  // for links inside the app (the browser prompt never sees those).
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    const leave = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!link || link.getAttribute("target") === "_blank" || event.defaultPrevented) return;
      const url = new URL((link as HTMLAnchorElement).href, window.location.href);
      if (url.origin !== window.location.origin || url.href === window.location.href) return;
      if (!window.confirm("You have unsaved changes. Leave without saving?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", leave, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", leave, true);
    };
  }, [dirty]);

  function guard(event: FormEvent<HTMLFormElement>) {
    if (problemKeys.length === 0) return;
    // Stop the request and take the person to the first field that needs work.
    event.preventDefault();
    setShowProblems(true);
    const id = inputId(idPrefix, problemKeys[0]);
    (document.getElementById(id) ?? document.getElementById(`${id}-label`))?.focus();
  }

  const statusText = conflict
    ? "Someone else changed this section."
    : dirty
      ? "Unsaved changes."
      : hasDraft
        ? SOURCE_TEXT.draft
        : publishedVersion
          ? SOURCE_TEXT.published
          : SOURCE_TEXT.defaults;

  return (
    <div className="space-y-6">
      {props.ignoredReason ? (
        <p role="status" className="rounded-md border border-border bg-muted p-3 text-sm">
          The saved version no longer fits the rules ({props.ignoredReason}). The form shows what the site has today.
          Saving replaces it.
        </p>
      ) : null}

      {conflict ? (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p>Someone else saved this section after you opened it. Your changes were not saved.</p>
          <button type="button" className={cn(buttonVariants.secondary, "mt-3")} onClick={() => window.location.reload()}>
            Reload the latest version
          </button>
        </div>
      ) : null}

      <form action={save} onSubmit={guard} noValidate className="space-y-6">
        <input type="hidden" name="page" value={page} />
        <input type="hidden" name="section" value={section} />
        <input type="hidden" name="base" value={base ?? ""} />
        <input type="hidden" name="payload" value={payload} />

        <FieldRenderer
          fields={fields}
          root={values}
          errors={errors}
          disabled={!canEdit}
          idPrefix={idPrefix}
          onChange={setValues}
        />

        {showProblems && problemKeys.length > 0 ? (
          <p role="alert" className="text-sm text-destructive">
            Fix {problemKeys.length} {problemKeys.length === 1 ? "field" : "fields"} marked above, then save again.
          </p>
        ) : null}

        <div className="sticky bottom-0 -mx-1 space-y-3 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
          <p role="status" aria-live="polite" className={cn("text-xs", dirty ? "text-foreground" : "text-muted-foreground")}>
            {statusText}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <button type="submit" disabled={busy || !dirty} className={buttonVariants.secondary}>
                {saving ? "Saving..." : "Save draft"}
              </button>
            ) : null}
            {canPublish ? (
              <button
                type="submit"
                formAction={publish}
                disabled={busy || (!dirty && !hasDraft)}
                className={buttonVariants.primary}
              >
                {publishing ? "Publishing..." : "Publish"}
              </button>
            ) : null}
            <a href={props.previewHref} target="_blank" rel="noreferrer" className={buttonVariants.secondary}>
              Preview
              <span className="sr-only"> (opens in a new tab, shows saved drafts)</span>
            </a>
          </div>
          {canPublish ? (
            <div>
              <label htmlFor={`${idPrefix}-note`} className="text-xs font-medium text-muted-foreground">
                Note for the history (optional)
              </label>
              <input
                id={`${idPrefix}-note`}
                name="note"
                type="text"
                maxLength={200}
                value={note}
                disabled={busy}
                className={cn(fieldClass, "mt-1")}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">You can save drafts. An owner or admin publishes them.</p>
          )}
        </div>
      </form>

      {canEdit && hasDraft ? (
        <form action={discard} className="rounded-md border border-border p-3">
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="section" value={section} />
          <input type="hidden" name="base" value={base ?? ""} />
          <p className="text-sm">Throw away the saved draft and go back to the published version.</p>
          <button
            type="submit"
            disabled={busy || dirty}
            className={cn(buttonVariants.smallDanger, "mt-3")}
            onClick={(event) => {
              if (!window.confirm("Discard the saved draft? This cannot be undone.")) event.preventDefault();
            }}
          >
            {discarding ? "Discarding..." : "Discard draft"}
          </button>
        </form>
      ) : null}

      {canPublish && props.history.length > 0 ? (
        <form action={restore} className="rounded-md border border-border p-3">
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="section" value={section} />
          <input type="hidden" name="base" value={base ?? ""} />
          <label htmlFor={`${idPrefix}-version`} className="text-sm font-medium">
            Earlier versions
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Restoring copies a version into your draft. Nothing changes for visitors until you publish.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              id={`${idPrefix}-version`}
              name="version"
              value={version}
              disabled={busy}
              className={cn(fieldClass, "w-auto min-w-0 max-w-full flex-1")}
              onChange={(event) => setVersion(event.target.value)}
            >
              {props.history.map((item) => (
                <option key={item.version} value={item.version}>
                  {`Version ${item.version}${item.status === "PUBLISHED" ? " (live)" : ""}, ${stamp(item.publishedAt ?? item.updatedAt)}${item.note ? `, ${item.note}` : ""}`}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy || dirty}
              className={buttonVariants.secondary}
              onClick={(event) => {
                if (!window.confirm("Replace your draft with this version?")) event.preventDefault();
              }}
            >
              {restoring ? "Restoring..." : "Restore"}
            </button>
          </div>
          {dirty ? <p className="mt-2 text-xs text-muted-foreground">Save or undo your edits first.</p> : null}
        </form>
      ) : null}
    </div>
  );
}
