import Link from "next/link";
import { Fragment, type ReactNode } from "react";

// The chat assistant answers in a small Markdown subset (lib/chatbot/
// prompts.ts): paragraphs, "-"/"*" and "1." lists, **bold**, *italic*,
// `code` and [links](url). Rendered as React elements, never as HTML, so
// model output can't inject markup; links go only to this site's own paths
// or to https URLs, and external ones open in a new tab without referrer.

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function safeHref(url: string): string | null {
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={key} className="rounded bg-black/10 px-1 py-0.5 text-[0.85em] dark:bg-white/10">
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const href = safeHref(link[2]);
      if (!href) return <Fragment key={key}>{link[1]}</Fragment>;
      return href.startsWith("/") ? (
        <Link key={key} href={href} className="font-medium underline underline-offset-2">
          {link[1]}
        </Link>
      ) : (
        <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
          {link[1]}
        </a>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={key}>{part.slice(1, -1)}</em>;
    return <Fragment key={key}>{part}</Fragment>;
  });
}

type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] };

function blocks(source: string): Block[] {
  const out: Block[] = [];
  for (const raw of source.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    const last = out[out.length - 1];
    if (!line) {
      out.push({ kind: "p", lines: [] });
    } else if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      const item = (bullet ?? numbered)![1];
      if (last && last.kind === kind) last.items.push(item);
      else out.push({ kind, items: [item] });
    } else if (last && last.kind === "p") {
      last.lines.push(line.replace(/^#{1,6}\s+/, ""));
    } else {
      out.push({ kind: "p", lines: [line.replace(/^#{1,6}\s+/, "")] });
    }
  }
  return out.filter((block) => (block.kind === "p" ? block.lines.length > 0 : block.items.length > 0));
}

export default function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 break-words leading-relaxed">
      {blocks(text).map((block, index) => {
        if (block.kind === "p") return <p key={index}>{inline(block.lines.join(" "), `p${index}`)}</p>;
        const List = block.kind;
        return (
          <List key={index} className={`space-y-1 pl-4 ${block.kind === "ul" ? "list-disc" : "list-decimal"}`}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{inline(item, `l${index}-${itemIndex}`)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
