import type { Metadata } from "next";

import NotFoundContent from "@/components/site/NotFoundContent";
import SiteShell from "@/components/site/SiteShell";

// Every unmatched URL lands here, inside the thin root layout, so the page wraps
// its content in SiteShell to keep the public navigation and footer. Unmatched
// URLs render through Next's internal /_not-found route, which is prerendered at
// build and answers 404 with full server-rendered HTML. A notFound() thrown while
// rendering a route is different: it falls back to a client-rendered shell, so
// the locked admin rewrites to an unmatched path instead of calling it
// (design notes, section 4.4). That rewrite is also how a locked
// /admin/* request without the unlock cookie resolves, so this page's metadata
// doubles as the noindex guarantee for that case.
//
// noindex here overrides the root layout's index:true — the HTTP status is
// already 404, but a search engine should never be offered this URL as a
// citable result, and a stray "index, follow" robots meta on a 404 response
// is exactly what an SEO audit flags.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Keep SiteShell free of Suspense boundaries and suspending awaits, or the 404
// would stream and answer 200.
export default function NotFound() {
  return (
    <SiteShell>
      <NotFoundContent />
    </SiteShell>
  );
}
