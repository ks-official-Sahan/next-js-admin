import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getOptionalUser, hasPermission } from "@/lib/auth/dal";
import { blogAiEnabled } from "@/lib/ai/availability";
import { limit } from "@/lib/cache/ratelimit";
import { rateLimitedResponse } from "@/lib/admin/rate-limited";
import { checkOrigin } from "@/lib/security/check-origin";
import { getEnv } from "@/lib/env";
import { realBlogDeps } from "@sahan-sac/blog-kit/deps";
import { blogSite } from "@/lib/ai/blog-site";
import { draftPost } from "@sahan-sac/blog-kit/helpers";

// POST /api/admin/ai/draft. Requires generateAI, rate limited per user
// (ai:text:user). Body: { topic, notes? }, both untrusted admin input,
// fenced as data by lib/ai/guard.ts before they reach a model
// (design notes, Step 12).

export const dynamic = "force-dynamic";
// Vercel Hobby allows at most 60 s; the AI chain stops at 50 s (lib/ai/blog.ts).
export const maxDuration = 60;

const bodySchema = z.object({
  topic: z.string().trim().min(1).max(300),
  notes: z.string().trim().max(1000).optional(),
});

const notFound = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
const forbidden = () => new NextResponse(null, { status: 403, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  // Off (ENABLE_BLOG_AI) or no provider configured: the route does not exist.
  if (!blogAiEnabled()) return notFound();

  const user = await getOptionalUser();
  if (!user || user.mustChangePassword) return notFound();
  if (!hasPermission(user, "generateAI")) return notFound();

  if (!checkOrigin(request.headers, request)) return forbidden();

  const limited = await limit("ai:text:user", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.resetSeconds, "AI assist");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "A topic is required." }, { status: 400 });
  }

  const result = await draftPost(parsed.data, realBlogDeps(getEnv(), blogSite));
  if (!result.ok) return NextResponse.json(result, { status: 502, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
