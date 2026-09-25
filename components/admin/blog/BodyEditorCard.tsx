"use client";

import { useState } from "react";
import { Columns2 } from "lucide-react";

import { cardClass } from "@/components/admin/ui/styles";
import { htmlToMarkdown, markdownToHtml } from "@/lib/blog/markdown";
import { cn } from "@/lib/utils";

import MarkdownField from "./MarkdownField";
import PostPreviewPane from "./PostPreviewPane";
import RichEditor from "./RichEditorField";

// The "Body" card: a Visual (TipTap) or Markdown editor, plus an optional
// live preview beside it. `content` (HTML) stays the single source of truth
// owned by the parent form. Markdown is a view over it: whenever `content`
// changes from outside (the AI assistant, a restored draft, the Visual
// editor) the Markdown text is re-derived during render, so it can never
// show stale text and nothing needs to force a mode switch.

type Editor = "visual" | "markdown";

/** Tall enough to write in, never taller than the screen: panes scroll inside. */
const PANE_HEIGHT = "h-[clamp(28rem,calc(100dvh-15rem),80rem)]";

const RICH_BLOCK_RE = /<(table|figure|aside|details)[\s>]/i;

function wordCount(html: string): number {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");
  return text.split(/\s+/).filter(Boolean).length;
}

export default function BodyEditorCard({ content, onChange }: { content: string; onChange: (html: string) => void }) {
  const [editor, setEditor] = useState<Editor>("visual");
  const [split, setSplit] = useState(false);

  // Markdown text plus the HTML it corresponds to. Re-seeded during render
  // (React's "adjust state when a prop changes" pattern) only when the HTML
  // moved on without this textarea: typing here keeps the two in step.
  const [md, setMd] = useState<{ text: string; html: string } | null>(null);
  if (editor === "markdown" && (md === null || md.html !== content)) {
    setMd({ text: htmlToMarkdown(content), html: content });
  }

  const words = wordCount(content);
  const minutes = Math.max(1, Math.round(words / 220));

  return (
    <section className={cardClass} aria-labelledby="post-body-label">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="post-body-label" className="text-sm font-semibold">
          Body
        </h2>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {words.toLocaleString()} words · {minutes} min read
        </span>

        <div className="ml-auto flex items-center gap-2">
          <div role="tablist" aria-label="Editor" className="inline-flex rounded-md border border-input p-0.5">
            {(["visual", "markdown"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={editor === option}
                onClick={() => setEditor(option)}
                className={cn(
                  "rounded px-3 py-1 text-xs font-medium capitalize transition-colors",
                  editor === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {option}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={split}
            onClick={() => setSplit((value) => !value)}
            title="Show the live preview beside the editor"
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
              split ? "border-primary bg-primary/10 text-foreground" : "border-input text-muted-foreground hover:text-foreground"
            )}
          >
            <Columns2 size={14} aria-hidden />
            Live preview
          </button>
        </div>
      </div>

      {editor === "visual" && RICH_BLOCK_RE.test(content) ? (
        <p className="mb-2 text-xs text-muted-foreground">
          Tables, charts, figures and callouts are kept as blocks here. Edit their contents in Markdown.
        </p>
      ) : null}

      <div className={cn(split && "grid gap-4 lg:grid-cols-2")}>
        <div className="min-w-0">
          {editor === "markdown" ? (
            <MarkdownField
              value={md?.text ?? ""}
              onChange={(next) => {
                const html = markdownToHtml(next);
                setMd({ text: next, html });
                onChange(html);
              }}
              placeholder="## Heading&#10;&#10;Write in Markdown…"
              className={split ? cn(PANE_HEIGHT, "resize-none") : "min-h-[clamp(28rem,calc(100dvh-15rem),80rem)]"}
            />
          ) : (
            <RichEditor value={content} onChange={onChange} className={split ? PANE_HEIGHT : "min-h-[clamp(28rem,calc(100dvh-18rem),80rem)]"} />
          )}
        </div>
        {split ? (
          <PostPreviewPane
            post={{ title: "", excerpt: "", topic: "", coverSrc: null, coverAlt: "", html: content }}
            chrome={false}
            className={cn("min-w-0", PANE_HEIGHT)}
          />
        ) : null}
      </div>
    </section>
  );
}
