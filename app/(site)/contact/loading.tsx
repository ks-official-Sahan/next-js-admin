import { HomeContainer } from "@/components/home/HomeSection";
import SkeletonBlock from "@/components/common/SkeletonBlock";

// Content-shaped placeholder for /contact: headline + subtitle, then a
// two-column shape matching ContactForm next to ContactDetailsCard/socials
// (single column on mobile, matching the real layout's breakpoint).
// Lightweight server component.
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="w-full overflow-hidden">
      <section className="w-full pb-[clamp(2.5rem,5vw,4rem)] pt-[clamp(6.5rem,12vw,9rem)]">
        <HomeContainer>
          <div className="flex flex-col items-start gap-6">
            <SkeletonBlock className="h-9 w-56 rounded-full" />
            <SkeletonBlock className="h-[clamp(2.25rem,1.1rem+4.6vw,5rem)] w-[min(480px,80%)]" />
            <SkeletonBlock className="h-[2.6em] w-full max-w-[52ch]" />
          </div>
        </HomeContainer>
      </section>

      <section className="w-full pt-[clamp(2rem,4vw,3rem)]">
        <HomeContainer>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
            <SkeletonBlock className="h-[28rem] w-full rounded-[24px]" />
            <div className="flex flex-col gap-4">
              <SkeletonBlock className="h-32 w-full rounded-[24px]" />
              <SkeletonBlock className="h-32 w-full rounded-[24px]" />
              <SkeletonBlock className="h-16 w-full rounded-[24px]" />
            </div>
          </div>
        </HomeContainer>
      </section>
    </div>
  );
}
