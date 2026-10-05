import { HEALTH_SERVICE } from "@/lib/site/active-url";

// Answers the domain probe in lib/site-url.ts: "this domain serves this app".
// No database or Redis read, so it stays cheap and says nothing about the
// rest of the stack. Exempt from maintenance mode (lib/admin/maintenance-bypass.ts).

export const dynamic = "force-dynamic";

const body = JSON.stringify({ ok: true, service: HEALTH_SERVICE });

export function GET() {
  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
