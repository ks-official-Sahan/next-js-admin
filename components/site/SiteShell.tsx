import { useGSAP } from "@gsap/react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { gsap } from "gsap";

import FloatingAudioSwitch from "@/components/common/FloatingAudioSwitch";
import Footer from "@/components/foo/Footer";
import Navigation from "@/components/nav/Navigation";
import JsonLd from "@/components/seo/JsonLd";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AudioProvider } from "@/context/AudioContext";

gsap.registerPlugin(useGSAP);

/**
 * Public site chrome: skip link, providers, navigation, audio switch,
 * footer. Rendered by app/(site)/layout.tsx and by the root 404
 * (app/not-found.tsx). Do not import it from the root layout or anything
 * under app/admin — admin mounts its own Mantine provider and CSS
 * (app/admin/layout.tsx) because MediaPicker still needs them; nothing here
 * pulls Mantine, NextUI or Shoelace into the public bundle any more (moved
 * out of Nav.tsx/SideBar.tsx/Navigation.tsx — plain markup, CSS transitions
 * and lib/use-reduced-motion instead). The former loading-screen splash
 * (components/animations/LoadingScreen.tsx, deleted) blocked first paint for
 * up to 2.5s on every load with no reduced-motion check and no functional
 * purpose (a timer, not real load state); removed rather than gated, since
 * the page underneath renders fine without it.
 * Keep it free of Suspense boundaries and suspending awaits, or the 404 would
 * stream and answer 200.
 */
export default function SiteShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ThemeProvider enableSystem attribute="class" defaultTheme="dark">
      <JsonLd />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[2000] focus:rounded-full focus:bg-[#91FF00] focus:px-4 focus:py-2 focus:text-black focus:outline-none"
      >
        Skip to content
      </a>
      <AudioProvider>
        <main className="flex flex-col min-h-screen w-full overflow-x-hidden">
          <Navigation />
          <FloatingAudioSwitch />
          <div id="main-content" className="pb-[300px]">
            {children}
          </div>
          <Footer />
          <SpeedInsights />
          <Analytics />
        </main>
      </AudioProvider>
    </ThemeProvider>
  );
}
