import { NextResponse, type NextRequest } from "next/server";

import { isAllowedWidth, isAllowedQuality } from "@sahan-sac/media-kit/validation";
import { verifyMediaSignature } from "@sahan-sac/media-kit/signature";

import { env } from "@/lib/env";
import { repos } from "@/lib/data";

// GET /media/[mediaId]?w=800&q=85&sig=...
// Delivers signed media from Cloudinary with restricted widths and qualities.
// Verifies the signature against MEDIA_SIGNING_SECRET before redirecting.

export const dynamic = "force-dynamic";

const notFound = () => new NextResponse(null, { status: 404 });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  if (!slug || slug.length === 0) return notFound();

  const mediaId = slug[0];
  const w = request.nextUrl.searchParams.get("w");
  const q = request.nextUrl.searchParams.get("q");
  const sig = request.nextUrl.searchParams.get("sig");

  // Parse and validate width and quality
  const width = w ? Number.parseInt(w, 10) : undefined;
  const quality = q ? Number.parseInt(q, 10) : undefined;

  if ((w && !width) || (q && !quality)) return notFound();
  if (width && !isAllowedWidth(width)) return notFound();
  if (quality && !isAllowedQuality(quality)) return notFound();

  // Verify signature
  if (!verifyMediaSignature({ mediaId, width, quality }, sig || "", env.MEDIA_SIGNING_SECRET)) {
    return notFound();
  }

  // Fetch the asset
  const asset = await repos.media.find(mediaId);

  if (!asset) return notFound();

  // Build Cloudinary delivery URL
  let deliveryUrl = asset.url;

  // Add Cloudinary transformations if width/quality specified
  if (asset.provider === "CLOUDINARY" && (width || quality)) {
    const transforms = [];
    if (width) transforms.push(`w_${width}`);
    if (quality) transforms.push(`q_${quality}`);
    if (width) transforms.push("c_limit"); // Don't upscale

    // Insert transforms into the Cloudinary URL
    // Format: /image/upload/[transforms]/[public_id]
    deliveryUrl = asset.url.replace("/upload/", `/upload/${transforms.join(",")}/`);
  }

  // Redirect to Cloudinary delivery URL
  return NextResponse.redirect(deliveryUrl, { status: 307 });
}
