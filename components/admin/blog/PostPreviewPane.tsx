"use client";

import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minimize2, Monitor, Moon, Smartphone, Sun } from "lucide-react";

import { previewPostHtmlAction } from "@/lib/actions/blog";
import { extractToc, renderPostContent } from "@/lib/blog/render";
import { cn } from "@/lib/utils";

// The one preview surface for the body editor's live preview and the top
// bar's whole-post Preview. It runs the public page's pipeline:
// previewPostHtmlAction (the real sanitizeRich on the server), then
// renderPostContent, into the same `.post-content` styles.
//
// Device: the post is laid out at a real width (the desktop article column,
// or a phone) and scaled down with CSS zoom to fit whatever space the pane
// has, so the toggle shows the real line length and wrapping even in a
// narrow split pane. Theme: a .light/.dark scope on the frame re-applies the
// site tokens (style/globals.css), independent of the admin's own theme.
// Full screen: an overlay over the whole app, plus the browser's Fullscreen
// API where allowed; Esc or the button returns to normal.

export type PreviewDevice = "desktop" | "mobile";
export type PreviewTheme = "light" | "dark";

export interface PostPreviewData {
  title: string;
  excerpt: string;
  topic: string;
  coverSrc: string | null;
  coverAlt: string;
  html: string;
}

/** The public article column (72ch plus padding) and a common phone width, in CSS px. */
const FRAME_WIDTH: Record<PreviewDevice, number> = { desktop: 760, mobile: 390 };

function ToggleGroup<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string; icon: ReactNode }[];
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-input p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          title={option.label}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors",
            value === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.icon}
          <span className="sr-only s640:not-sr-only">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

export default function PostPreviewPane({
  post,
  chrome = true,
  className,
  defaultExpanded = false,
  onCollapse,
}: {
  post: PostPreviewData;
  /** Title, topic, excerpt and cover above the body (the whole-post preview). */
  chrome?: boolean;
  className?: string;
  /** Open straight into full screen (the top bar's Preview button). */
  defaultExpanded?: boolean;
  /** Called when full screen closes; a parent that opened the pane only for full screen unmounts it here. */
  onCollapse?: () => void;
}) {
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [theme, setTheme] = useState<PreviewTheme>("dark");
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [available, setAvailable] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // `source` is the editor HTML the preview was rendered from, so "pending"
  // is derived (source differs from the current HTML), never set in an effect.
  const [rendered, setRendered] = useState({ source: "", html: "", failed: false });

  useEffect(() => {
    // A newer edit cancels an older request, so a slow response can never
    // overwrite the preview of a later one.
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const sanitized = await previewPostHtmlAction(post.html);
        if (!cancelled) setRendered({ source: post.html, html: renderPostContent(sanitized), failed: false });
      } catch {
        if (!cancelled) setRendered((current) => ({ ...current, source: post.html, failed: true }));
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [post.html]);

  // The width the frame may use, measured from the scroll viewport.
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function closeFullscreen() {
    setExpanded(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    onCollapse?.();
  }
  // The same close, callable from the listeners below with the latest props.
  const collapse = useEffectEvent(closeFullscreen);

  // While expanded: Esc closes, the page behind does not scroll, and leaving
  // browser full screen (its own Esc handling) closes the overlay too.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") collapse();
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) collapse();
    };
    const node = rootRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      // Unmounted while full screen (e.g. Ctrl/Cmd+Shift+P again): leave it.
      if (node && document.fullscreenElement === node) void document.exitFullscreen().catch(() => {});
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [expanded]);

  // Opened straight into full screen: ask the browser once, on mount (still
  // inside the click's user activation window). The overlay works without it.
  useEffect(() => {
    if (defaultExpanded) void rootRef.current?.requestFullscreen?.().catch(() => {});
  }, [defaultExpanded]);

  function toggleExpanded() {
    if (expanded) {
      closeFullscreen();
      return;
    }
    setExpanded(true);
    void rootRef.current?.requestFullscreen?.().catch(() => {});
  }

  const pending = rendered.source !== post.html;
  const toc = extractToc(rendered.html);
  const frameWidth = FRAME_WIDTH[device];
  const zoom = available ? Math.min(1, available / frameWidth) : 1;

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex flex-col",
        expanded ? "fixed inset-0 z-[80] bg-background p-3 s768:p-5" : className
      )}
      {...(expanded ? { role: "dialog", "aria-modal": true, "aria-label": "Post preview" } : {})}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground" aria-live="polite">
          Preview
          {pending ? <span className="animate-pulse">· updating</span> : null}
          {zoom < 1 ? <span>· {Math.round(zoom * 100)}%</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            label="Device"
            value={device}
            onChange={setDevice}
            options={[
              { value: "desktop", label: "Desktop", icon: <Monitor size={13} aria-hidden /> },
              { value: "mobile", label: "Mobile", icon: <Smartphone size={13} aria-hidden /> },
            ]}
          />
          <ToggleGroup
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "light", label: "Light", icon: <Sun size={13} aria-hidden /> },
              { value: "dark", label: "Dark", icon: <Moon size={13} aria-hidden /> },
            ]}
          />
          <button
            type="button"
            onClick={toggleExpanded}
            aria-pressed={expanded}
            title={expanded ? "Exit full screen (Esc)" : "Full screen"}
            className="flex h-8 items-center gap-1.5 rounded-md border border-input px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {expanded ? <Minimize2 size={13} aria-hidden /> : <Maximize2 size={13} aria-hidden />}
            <span className="sr-only s640:not-sr-only">{expanded ? "Exit" : "Full screen"}</span>
          </button>
        </div>
      </div>

      <div ref={viewportRef} className="min-h-0 flex-1 overflow-auto rounded-md border border-input bg-muted/30 p-3">
        <div
          // The site's own tokens for the chosen theme, whatever the admin's theme is.
          className={cn(theme, "mx-auto overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-sm")}
          style={{ width: frameWidth, zoom }}
        >
          <div className={device === "mobile" ? "px-4 py-6" : "px-5 py-8"}>
            {chrome ? (
              <header className="mb-6">
                {post.topic ? (
                  <span className="rounded-full bg-bICON_FADE px-3 py-1 text-xs font-semibold text-bICON">{post.topic}</span>
                ) : null}
                <h1
                  className={cn(
                    "mt-4 text-balance font-semibold leading-[1.08] tracking-[-0.02em]",
                    device === "mobile" ? "text-[2rem]" : "text-[2.75rem]"
                  )}
                >
                  {post.title || "Untitled post"}
                </h1>
                {post.excerpt ? <p className="mt-3 text-sm opacity-70">{post.excerpt}</p> : null}
                {post.coverSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin preview of a Cloudinary/LOCAL asset
                  <img src={post.coverSrc} alt={post.coverAlt} className="mt-6 h-auto w-full rounded-[20px] border border-bBORDERFADE object-cover" />
                ) : null}
              </header>
            ) : null}

            {toc.length >= 3 ? (
              <nav aria-label="Table of contents" className="mb-6 rounded-[20px] border border-bBORDERFADE bg-bCARD p-5 text-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] opacity-70">On this page</p>
                <ol className="mt-3 space-y-1.5">
                  {toc.map((item) => (
                    <li key={item.id} className={item.level === 3 ? "pl-4 opacity-80" : undefined}>
                      <a href={`#${item.id}`} className="hover:text-bICON hover:underline">
                        {item.text}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            ) : null}

            {rendered.failed ? (
              <p role="alert" className="mb-3 text-xs text-destructive">
                Preview could not refresh. Showing the last rendered version.
              </p>
            ) : null}
            {rendered.html ? (
              <div
                className={cn("post-content", device === "mobile" ? "text-[15px]" : "text-[17px]")}
                dangerouslySetInnerHTML={{ __html: rendered.html }}
              />
            ) : (
              <p className="text-sm opacity-60">{pending ? "Rendering preview…" : "Nothing to preview yet."}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
