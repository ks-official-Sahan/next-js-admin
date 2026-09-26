import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getOptionalUser, hasPermission } from "@/lib/auth/dal";
import { limit } from "@/lib/cache/ratelimit";
import { rateLimitedResponse } from "@/lib/admin/rate-limited";
import { checkOrigin } from "@/lib/security/check-origin";
import { getEnv } from "@/lib/env";
import { generateImage, imageConfigFromEnv } from "@/lib/ai/image";
import { registerGeneratedImage } from "@/lib/media/service";
import { cloudinary } from "@/lib/media/cloudinary";
import { MEDIA_CONFIG } from "@/lib/media/config";

// POST /api/admin/ai/generate-image. Requires generateAI, rate limited per
// user (ai:image:user). Body:
// { prompt, alt }. Generates one image and registers it as a media asset —
// the Featured image card's "AI Image Prompt" button uses this to set the
// featured image directly (lib/media/service.ts's registerGeneratedImage,
// the same path the streamed full-post generator uses for its images).

export const dynamic = "force-dynamic";
// One image takes ~10-20 s, and a fallback model can add another attempt.
export const maxDuration = 120;

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(500),
  alt: z.string().trim().min(1).max(200),
});

const notFound = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
const forbidden = () => new NextResponse(null, { status: 403, headers: { "Cache-Control": "no-store" } });

const IMAGE_FOLDER = `${MEDIA_CONFIG.uploadFolder}/ai-blog`;

export async function POST(request: NextRequest) {
  const user = await getOptionalUser();
  if (!user || user.mustChangePassword) return notFound();
  if (!hasPermission(user, "generateAI")) return notFound();

  if (!checkOrigin(request.headers, request)) return forbidden();

  const limited = await limit("ai:image:user", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.resetSeconds, "Image generation");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "A prompt and alt text are required." }, { status: 400 });
  }

  const imageConfig = imageConfigFromEnv(getEnv());
  if (!imageConfig) {
    return NextResponse.json(
      { ok: false, error: "AI image generation is not configured on this server." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Stops before maxDuration, and when the admin leaves (image calls are billed).
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(100_000)]);
  const outcome = await generateImage(parsed.data.prompt, imageConfig, { aspectRatio: "16:9", signal });
  if (!outcome.ok) {
    return NextResponse.json({ ok: false, error: outcome.error }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  const registered = await registerGeneratedImage(
    { base64: outcome.base64, mimeType: outcome.mimeType, alt: parsed.data.alt, folder: IMAGE_FOLDER, cloudinaryClient: cloudinary },
    { id: user.id, email: user.email }
  );
  if (!registered.ok) {
    // The image itself was generated: send it back so the editor can show it,
    // offer a download, and retry the upload from the browser instead of the
    // admin losing a paid generation.
    return NextResponse.json(
      { ok: false, error: registered.error, image: { base64: outcome.base64, mimeType: outcome.mimeType } },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { ok: true, mediaId: registered.asset.id, url: registered.asset.url, alt: parsed.data.alt },
    { headers: { "Cache-Control": "no-store" } }
  );
}
