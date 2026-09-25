import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getOptionalUser, hasPermission } from "@/lib/auth/dal";
import { limit } from "@/lib/cache/ratelimit";
import { checkOrigin } from "@/lib/security/check-origin";
import { defaultAiDeps, generateSeoSuggestion } from "@/lib/ai/blog-generate";

// POST /api/admin/ai/seo. Requires generateAI, rate limited per user
// (ai:admin:user, shared with the other AI helpers). Body:
// { title, contentText }. Regenerates only seoTitle/seoDescription/excerpt
// from the post's current title and body text — the "Suggest SEO" button,
// distinct from the full-post generator.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  contentText: z.string().trim().min(1).max(20_000),
});

const notFound = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
const forbidden = () => new NextResponse(null, { status: 403, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  const user = await getOptionalUser();
  if (!user || user.mustChangePassword) return notFound();
  if (!hasPermission(user, "generateAI")) return notFound();

  if (!checkOrigin(request.headers, request)) return forbidden();

  const limited = await limit("ai:admin:user", user.id);
  if (!limited.ok) return new NextResponse(null, { status: 429, headers: { "Cache-Control": "no-store" } });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "A title and some content are required." }, { status: 400 });
  }

  const result = await generateSeoSuggestion(parsed.data, defaultAiDeps());
  if (!result.ok) return NextResponse.json(result, { status: 502, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ok: true, ...result.seo }, { headers: { "Cache-Control": "no-store" } });
}
