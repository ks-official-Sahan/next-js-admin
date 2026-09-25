"use client";

import { type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import LocalDateTimeField from "@/components/admin/ui/LocalDateTimeField";
import { badgeClass, buttonVariants, fieldClass } from "@/components/admin/ui/styles";
import { cn } from "@/lib/utils";

import SidebarCard from "./SidebarCard";

// "Publishing" card: status, a category (topic, single-select chips from the
// site's existing taxonomy) and tags (multi, free-form + suggestions), and
// (create only) a schedule datetime. Save Draft / Publish Now / Update live
// in the sticky top bar instead (BlogEditorForm) — PublishButton is exported
// so that top bar can submit the *same* create-form fields (`publishIntent`)
// this card's schedule input feeds, without a second copy of the button.
//
// On the edit page the actual publish/schedule/archive transitions already
// have a battle-tested Server Action (setPostStatusAction in
// lib/actions/blog.ts, wired up in app/admin/(panel)/blog/[id]/page.tsx) —
// `statusPanel` lets that page render its own form here instead of this
// card inventing a second, parallel way to change status.

function ChipToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

export function PublishButton({ intent, canPublish, label, pendingLabel }: { intent: "draft" | "publish"; canPublish: boolean; label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  if (intent === "publish" && !canPublish) return null;
  return (
    <button
      type="submit"
      name="publishIntent"
      value={intent}
      disabled={pending}
      className={intent === "publish" ? buttonVariants.primary : buttonVariants.secondary}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export default function PublishingCard({
  status,
  topic,
  onTopicChange,
  existingTopics,
  tags,
  onTagsChange,
  existingTags,
  statusPanel,
  canPublish,
}: {
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";
  topic: string;
  onTopicChange: (topic: string) => void;
  existingTopics: string[];
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  existingTags: string[];
  /** Provided by the edit page: its own publish/schedule/archive form. */
  statusPanel?: ReactNode;
  canPublish: boolean;
}) {
  const addTag = (value: string) => {
    const clean = value.trim().toLowerCase();
    if (!clean || tags.includes(clean)) return;
    onTagsChange([...tags, clean]);
  };

  return (
    <SidebarCard title="Publishing">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Status</span>
        <span className={badgeClass}>{status}</span>
      </div>

      <div className="mt-4">
        <span className="text-sm font-medium">Category</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {existingTopics.map((name) => (
            <ChipToggle key={name} label={name} active={topic === name} onClick={() => onTopicChange(name)} />
          ))}
        </div>
        <input
          className={cn(fieldClass, "mt-2")}
          value={topic}
          onChange={(event) => onTopicChange(event.target.value)}
          placeholder="Or type a new category"
          aria-label="Category"
          maxLength={50}
        />
      </div>

      <div className="mt-4">
        <span className="text-sm font-medium">Tags</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <ChipToggle key={tag} label={tag} active onClick={() => onTagsChange(tags.filter((t) => t !== tag))} />
          ))}
          {existingTags
            .filter((tag) => !tags.includes(tag))
            .slice(0, 8)
            .map((tag) => (
              <ChipToggle key={tag} label={tag} active={false} onClick={() => addTag(tag)} />
            ))}
        </div>
        {/* Native datalist: keyboard-accessible autocomplete from every tag already
            in use, without a bespoke combobox widget (existing tags also come pre-
            suggested as chips above). */}
        <input
          className={cn(fieldClass, "mt-2")}
          placeholder="Type a tag and press Enter"
          aria-label="Add a tag"
          list="tag-suggestions"
          maxLength={30}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== ",") return;
            event.preventDefault();
            addTag(event.currentTarget.value);
            event.currentTarget.value = "";
          }}
        />
        <datalist id="tag-suggestions">
          {existingTags
            .filter((tag) => !tags.includes(tag))
            .map((tag) => (
              <option key={tag} value={tag} />
            ))}
        </datalist>
      </div>

      {statusPanel ? (
        <div className="mt-5 border-t border-border pt-4">{statusPanel}</div>
      ) : canPublish ? (
        <div className="mt-5 space-y-1.5 border-t border-border pt-4">
          <label htmlFor="scheduleAt" className="text-sm font-medium">
            Schedule publish (optional)
          </label>
          <LocalDateTimeField id="scheduleAt" name="scheduleAt" className={fieldClass} />
          <p className="text-xs text-muted-foreground">
            Set a time, then use &ldquo;Publish now&rdquo; in the top bar. It publishes immediately, or at this time if it&apos;s in the future.
          </p>
        </div>
      ) : null}
    </SidebarCard>
  );
}
