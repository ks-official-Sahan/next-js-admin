import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getOptionalUser, hasPermission } from "@/lib/auth/dal";
import { blogAiImagesEnabled } from "@/lib/ai/availability";
import { limit } from "@/lib/cache/ratelimit";
import { rateLimitedResponse } from "@/lib/admin/rate-limited";
import { checkOrigin } from "@/lib/security/check-origin";
import { getEnv } from "@/lib/env";
import { imageConfigFromEnv } from "@sahan-sac/ai-core/image";
import { generateBlogImage } from "@sahan-sac/blog-kit/images";

import { mediaLibrarySink } from "@/lib/ai/image-sink";
import { MEDIA_UPLOAD_FOLDER } from "@/lib/media/folder";

// POST /api/admin/ai/generate-image. Requires generateAI, rate limited per
// user (ai:image:user). Body:
// { prompt, alt }. Generates one image and registers it as a media asset —
// the Featured image card's "AI Image Prompt" button uses this to set the
// featured image directly (@sahan-sac/blog-kit's generateBlogImage into the
// media library sink, the same path the streamed full-post generator uses).

export const dynamic = "force-dynamic";
// Vercel Hobby allows at most 60 s. FLUX on NVIDIA takes ~6-9 s; the signal
// below leaves time to upload the result before the hard stop.
export const maxDuration = 60;

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(500),
  alt: z.string().trim().min(1).max(200),
});

const notFound = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
const forbidden = () => new NextResponse(null, { status: 403, headers: { "Cache-Control": "no-store" } });

const IMAGE_FOLDER = `${MEDIA_UPLOAD_FOLDER}/ai-blog`;

export async function POST(request: NextRequest) {
  // Off (ENABLE_BLOG_AI) or no provider configured: the route does not exist.
  if (!blogAiImagesEnabled()) return notFound();

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
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]);
  const result = await generateBlogImage(
    parsed.data.prompt,
    { alt: parsed.data.alt, folder: IMAGE_FOLDER, aspectRatio: "16:9", signal },
    { config: imageConfig, sink: mediaLibrarySink({ id: user.id, email: user.email }) }
  );
  if (!result.ok && result.stage === "generate") {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  if (!result.ok) {
    // The image itself was generated: send it back so the editor can show it,
    // offer a download, and retry the upload from the browser instead of the
    // admin losing a paid generation.
    return NextResponse.json(
      { ok: false, error: result.error, image: result.image },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { ok: true, mediaId: result.mediaId, url: result.url, alt: parsed.data.alt },
    { headers: { "Cache-Control": "no-store" } }
  );
}
