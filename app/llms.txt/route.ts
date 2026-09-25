import { getLlmsTxtContent } from "@/lib/seo/llms-txt";

// Public llms.txt endpoint. Serves the persisted content (or generates it on
// the fly if never regenerated — see lib/seo/llms-txt.ts). Revalidated
// hourly so a stale copy self-heals even if nobody clicks "Regenerate".
export const revalidate = 3600;

export async function GET() {
  const content = await getLlmsTxtContent();
  return new Response(content, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
