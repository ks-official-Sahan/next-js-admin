import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getOptionalUser, hasPermission } from "@/lib/auth/dal";
import { limit } from "@/lib/cache/ratelimit";
import { rateLimitedResponse } from "@/lib/admin/rate-limited";
import { checkOrigin } from "@/lib/security/check-origin";
import { getEnv } from "@/lib/env";
import { defaultAiDeps, generateBlogPost } from "@/lib/ai/blog-generate";
import { generateImageVertex, vertexImageConfigFromEnv } from "@/lib/ai/image";
import { removeImageToken } from "@/lib/blog/ai-image-tokens";
import { registerGeneratedImage } from "@/lib/media/service";
import { cloudinary } from "@/lib/media/cloudinary";
import { MEDIA_CONFIG } from "@/lib/media/config";
import { db } from "@/lib/db/prisma";
import { ensureUniqueSlug, slugify } from "@/lib/blog/slug";
import { log } from "@/lib/log";

// POST /api/admin/ai/generate-post. Requires generateAI, rate limited per
// user (ai:post:user). Streams progress as
// the generation runs: the model call in lib/ai/blog-generate.ts is a single
// non-streaming request per provider (createAiService wraps generateText,
// not streamText, across the whole fallback chain — see lib/ai/providers.ts,
// which this task does not change), so "streaming" here means staged
// Server-Sent Events rather than token-by-token text: a `stage` event while
// the model writes, one `content` event with the complete parsed post the
// moment it is ready, then one `image` event per image (featured + up to 3
// content images) as each finishes generating in parallel, and a final
// `done`. Body: { prompt, tone, length, featuredImage?, inlineImages? }:
// the two switches default to on, and an image that is switched off is
// never requested from the model or the image provider.

export const dynamic = "force-dynamic";
// Text generation (plus one repair) and image generation (~10-20 s each, in
// parallel) can outlast a platform's short default function timeout.
export const maxDuration = 300;

/** Leaves the stream time to report and close before the platform's hard stop. */
const ROUTE_BUDGET_MS = 285_000;
const IMAGE_TIMEOUT_MS = 90_000;

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  tone: z.enum(["Professional", "Friendly", "Technical", "Casual"]),
  length: z.enum(["Short", "Medium", "Long"]),
  featuredImage: z.boolean().default(true),
  inlineImages: z.boolean().default(true),
});

const notFound = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
const forbidden = () => new NextResponse(null, { status: 403, headers: { "Cache-Control": "no-store" } });

function sseLine(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const IMAGE_FOLDER = `${MEDIA_CONFIG.uploadFolder}/ai-blog`;

export async function POST(request: NextRequest) {
  const user = await getOptionalUser();
  if (!user || user.mustChangePassword) return notFound();
  if (!hasPermission(user, "generateAI")) return notFound();

  if (!checkOrigin(request.headers, request)) return forbidden();

  const limited = await limit("ai:post:user", user.id);
  if (!limited.ok) return rateLimitedResponse(limited.resetSeconds, "Post generation");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "A prompt is required." }, { status: 400 });
  }

  const input = parsed.data;
  const env = getEnv();
  const actor = { id: user.id, email: user.email };
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const startedAt = Date.now();
      // Each image stops at its own cap or at the route's remaining budget,
      // whichever is sooner, and every image stops when the admin closes the
      // tab (request.signal): image generation is billed per call.
      const imageSignal = () =>
        AbortSignal.any([
          request.signal,
          AbortSignal.timeout(Math.max(5_000, Math.min(IMAGE_TIMEOUT_MS, ROUTE_BUDGET_MS - (Date.now() - startedAt)))),
        ]);
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseLine(event, data)));
        } catch {
          closed = true;
        }
      };

      try {
        send("stage", { stage: "writing" });
        const result = await generateBlogPost(input, defaultAiDeps(), {
          onStatus: (status) => {
            send("provider_status", status);
          },
        });
        if (!result.ok) {
          send("error", { error: result.error });
          return;
        }
        const { post } = result;
        // The prompt already asks for no inline images when they are off; a
        // model that adds some anyway has them removed, not generated.
        if (!input.inlineImages) {
          for (const image of post.contentImages) post.bodyMarkdown = removeImageToken(post.bodyMarkdown, image.token);
          post.contentImages = [];
        }

        // Uniqueness only needs to check slugs that could collide with a
        // suffixed variant of this candidate, not the whole table.
        const base = slugify(post.title) || "post";
        const nearby = await db.post.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } });
        const slug = ensureUniqueSlug(base, new Set(nearby.map((row) => row.slug)));

        send("content", {
          title: post.title,
          slug,
          excerpt: post.excerpt,
          bodyMarkdown: post.bodyMarkdown,
          seoTitle: post.seoTitle,
          seoDescription: post.seoDescription,
          topic: post.topic,
          tags: post.tags,
          featuredImageAlt: post.featuredImage.alt,
          contentImages: post.contentImages.map((image) => ({ token: image.token, alt: image.alt, caption: image.caption })),
          provider: result.provider,
        });

        const imageConfig = vertexImageConfigFromEnv(env);
        if (!imageConfig) {
          if (input.featuredImage) send("image", { which: "featured", status: "unavailable" });
          for (const image of post.contentImages) send("image", { which: image.token, status: "unavailable" });
          send("done", {});
          return;
        }

        const jobs: Promise<void>[] = [];

        if (input.featuredImage) jobs.push(
          (async () => {
            send("image", { which: "featured", status: "start" });
            const outcome = await generateImageVertex(post.featuredImage.prompt, imageConfig, { aspectRatio: "16:9", signal: imageSignal() });
            if (!outcome.ok) {
              send("image", { which: "featured", status: "error", error: outcome.error });
              return;
            }
            const registered = await registerGeneratedImage(
              { base64: outcome.base64, mimeType: outcome.mimeType, alt: post.featuredImage.alt, folder: IMAGE_FOLDER, cloudinaryClient: cloudinary },
              actor
            );
            if (!registered.ok) {
              send("image", { which: "featured", status: "error", error: registered.error });
              return;
            }
            send("image", { which: "featured", status: "done", mediaId: registered.asset.id, url: registered.asset.url, alt: post.featuredImage.alt });
          })()
        );

        for (const image of post.contentImages) {
          jobs.push(
            (async () => {
              send("image", { which: image.token, status: "start" });
              const outcome = await generateImageVertex(image.prompt, imageConfig, { aspectRatio: "4:3", signal: imageSignal() });
              if (!outcome.ok) {
                send("image", { which: image.token, status: "error", error: outcome.error });
                return;
              }
              const registered = await registerGeneratedImage(
                { base64: outcome.base64, mimeType: outcome.mimeType, alt: image.alt, folder: IMAGE_FOLDER, cloudinaryClient: cloudinary },
                actor
              );
              if (!registered.ok) {
                send("image", { which: image.token, status: "error", error: registered.error });
                return;
              }
              send("image", { which: image.token, status: "done", mediaId: registered.asset.id, url: registered.asset.url, alt: image.alt });
            })()
          );
        }

        await Promise.all(jobs);
        send("done", {});
      } catch (error) {
        log.error("ai blog generation stream failed", { error: error instanceof Error ? error.message : String(error) });
        send("error", { error: "Something went wrong while generating the post." });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by the client disconnecting; nothing to do.
        }
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
