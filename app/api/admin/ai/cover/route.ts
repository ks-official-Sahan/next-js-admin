import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getOptionalUser, hasPermission } from "@/lib/auth/dal";
import { limit } from "@/lib/cache/ratelimit";
import { rateLimitedResponse } from "@/lib/admin/rate-limited";
import { checkOrigin } from "@/lib/security/check-origin";
import { defaultAiDeps, suggestCover } from "@/lib/ai/blog";

// POST /api/admin/ai/cover. Requires generateAI, rate limited per user
// (ai:text:user). Body: { topic }. Returns a text prompt
// the admin can hand to an image tool; no image-capable provider is wired in
// this step, so this never generates or stores a file itself
// (design notes, Step 12).

export const dynamic = "force-dynamic";
// Vercel Hobby allows at most 60 s; the AI chain stops at 50 s (lib/ai/blog.ts).
export const maxDuration = 60;

const bodySchema = z.object({ topic: z.string().trim().min(1).max(300) });

const notFound = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
const forbidden = () => new NextResponse(null, { status: 403, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
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

  const result = await suggestCover(parsed.data, defaultAiDeps());
  if (!result.ok) return NextResponse.json(result, { status: 502, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
