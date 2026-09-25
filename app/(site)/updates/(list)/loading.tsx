import { HomeContainer } from "@/components/home/HomeSection";
import SkeletonBlock from "@/components/common/SkeletonBlock";

// Content-shaped placeholder for /updates (the list page only — not
// /updates/[slug], which another stream owns): headline + subtitle, then a
// stack of post-card placeholders matching UpdatesExplorer's list. Lightweight
// server component.
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="w-full overflow-hidden">
      <section className="w-full pb-[clamp(2.5rem,5vw,4rem)] pt-[clamp(6.5rem,12vw,9rem)]">
        <HomeContainer>
          <div className="flex flex-col items-start gap-6">
            <SkeletonBlock className="h-[clamp(2.25rem,1.1rem+4.6vw,5rem)] w-[min(480px,80%)]" />
            <SkeletonBlock className="h-[2.6em] w-full max-w-[52ch]" />
            <SkeletonBlock className="h-8 w-28 rounded-full" />
          </div>
        </HomeContainer>
      </section>

      <section className="w-full pt-[clamp(2rem,4vw,3rem)]">
        <HomeContainer>
          <div className="mb-8 flex flex-wrap gap-3">
            <SkeletonBlock className="h-9 w-24 rounded-full" />
            <SkeletonBlock className="h-9 w-24 rounded-full" />
            <SkeletonBlock className="h-9 w-24 rounded-full" />
          </div>
          <div className="flex flex-col gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-32 w-full rounded-[20px]" />
            ))}
          </div>
        </HomeContainer>
      </section>
    </div>
  );
}
