"use client";

import Icon from "@/components/icons/Icon";
import { HomeContainer } from "@/components/home/HomeSection";
import UpdatesCard from "@/components/updates/UpdatesCard";
import type { PageContent } from "@/lib/cms/registry";
import { cn } from "@/lib/utils";
import React, { useMemo, useState } from "react";

const chip =
  "press min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors";
const on = "border-transparent bg-bICON_FADE text-bICON";
const off = "border-bBORDERFADE bg-bCHIP opacity-80 hover:opacity-100";

export interface UpdatesListPost {
  id: string;
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  topic: string;
  tags: string[];
}

interface UpdatesExplorerProps {
  content: PageContent<"updates">;
  /** Published posts, from the database when the Post table has rows, else the code defaults (lib/blog/queries.ts). */
  posts: UpdatesListPost[];
  nextCursor: string | null;
}

const UpdatesExplorer = ({ content, posts: initialPosts, nextCursor: initialCursor }: UpdatesExplorerProps) => {
  const [posts, setPosts] = useState(initialPosts);
  const [nextCursor, setNextCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Topics and tags are computed from the posts actually shown, so a filter
  // can never advertise something that is not there (design notes, Step 12).
  const topics = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of posts) counts.set(post.topic, (counts.get(post.topic) ?? 0) + 1);
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  }, [posts]);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of posts) for (const tag of post.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  }, [posts]);

  const [topic, setTopic] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return posts.filter(
      (post) =>
        (!topic || post.topic === topic) &&
        (!tag || post.tags.includes(tag)) &&
        (!needle ||
          post.title.toLowerCase().includes(needle) ||
          post.excerpt.toLowerCase().includes(needle))
    );
  }, [posts, topic, tag, query]);

  const filtered = Boolean(topic || tag || query.trim());
  const clear = () => {
    setTopic(null);
    setTag(null);
    setQuery("");
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/content/v1/posts?limit=20&cursor=${encodeURIComponent(nextCursor)}`);
      const result = (await response.json().catch(() => null)) as
        | { data?: { items?: UpdatesListPost[]; nextCursor?: string | null }; error?: string }
        | null;
      if (!response.ok || !result?.data?.items) throw new Error(result?.error || "Could not load older updates.");
      setPosts((current) => {
        const seen = new Set(current.map((post) => post.id));
        return [...current, ...result.data!.items!.filter((post) => !seen.has(post.id))];
      });
      setNextCursor(result.data.nextCursor ?? null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load older updates.");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section aria-label="Updates" className="w-full">
      <HomeContainer>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[300px_1fr] lg:gap-12">
          {/* FILTERS: chips scroll sideways on phones, stick on laptops */}
          <aside
            aria-label="Filter updates"
            className="flex flex-col gap-6 lg:sticky lg:top-28 lg:self-start"
          >
            <div>
              <label htmlFor="updates-search" className="sr-only">
                Search updates
              </label>
              <div className="relative">
                <Icon name="magnifier" className="size-4 pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 opacity-60" />
                <input
                  id="updates-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search updates"
                  className="min-h-12 w-full rounded-full border border-bBORDERFADE bg-bCARD pl-11 pr-4 text-[15px]"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold">{content.filters.topicsTitle}</h2>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 s640:-mx-8 s640:px-8 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
                <button
                  type="button"
                  aria-pressed={!topic}
                  onClick={() => setTopic(null)}
                  className={cn(chip, !topic ? on : off)}
                >
                  All
                  <span className="ml-2 tabular-nums opacity-70">
                    {posts.length}
                  </span>
                </button>
                {topics.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    aria-pressed={topic === item.name}
                    onClick={() =>
                      setTopic(topic === item.name ? null : item.name)
                    }
                    className={cn(chip, topic === item.name ? on : off)}
                  >
                    {item.name}
                    <span className="ml-2 tabular-nums opacity-70">
                      {item.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold">{content.filters.tagsTitle}</h2>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 s640:-mx-8 s640:px-8 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
                {tags.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    aria-pressed={tag === item.name}
                    onClick={() => setTag(tag === item.name ? null : item.name)}
                    className={cn(chip, tag === item.name ? on : off)}
                  >
                    #{item.name}
                  </button>
                ))}
              </div>
            </div>

            {filtered && (
              <button
                type="button"
                onClick={clear}
                className="press inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-2 text-sm font-medium opacity-80 hover:opacity-100"
              >
                <Icon name="x" className="size-4" />
                Clear filters
              </button>
            )}
          </aside>

          {/* POSTS */}
          <div>
            <p aria-live="polite" className="sr-only">
              Showing {visible.length} {visible.length === 1 ? "update" : "updates"}
            </p>
            <p className="mb-4 text-sm text-muted-foreground">
              Showing {posts.length} recent updates{nextCursor ? "; load older updates to browse further back." : "."}
            </p>

            {visible.length > 0 ? (
              <ol
                key={`${topic}-${tag}`}
                className="swap-in flex flex-col gap-5"
              >
                {visible.map((post) => (
                  <li key={post.id}>
                    <UpdatesCard
                      id={post.id}
                      slug={post.slug}
                      title={post.title}
                      date={post.date}
                      content={post.excerpt}
                      topic={post.topic}
                      tags={post.tags}
                    />
                  </li>
                ))}
              </ol>
            ) : (
              <div className="flex flex-col items-start gap-4 rounded-[20px] border border-bBORDERFADE bg-bCARD p-8">
                <p className="text-base opacity-80">
                  No updates match those filters.
                </p>
                <button
                  type="button"
                  onClick={clear}
                  className="press min-h-11 rounded-full border border-bBORDERFADE bg-bFCARD px-5 text-sm font-semibold"
                >
                  Clear filters
                </button>
              </div>
            )}
            {loadError ? <p role="alert" className="mt-4 text-sm text-destructive">{loadError}</p> : null}
            {nextCursor ? (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="press min-h-11 rounded-full border border-bBORDERFADE bg-bCHIP px-5 text-sm font-semibold disabled:opacity-60"
                >
                  {loadingMore ? "Loading…" : "Load older updates"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </HomeContainer>
    </section>
  );
};

export default UpdatesExplorer;
