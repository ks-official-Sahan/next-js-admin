// Cloudinary delivery URLs for images rendered with a plain <img> (next/image
// already optimizes through /_next/image). A stored `secure_url` points at the
// untouched original; inserting a transformation right after /image/upload/
// asks Cloudinary for a width-limited, automatically compressed copy in the
// best format the browser accepts (AVIF/WebP), which is what keeps a cover
// image from being the slowest thing on the page. Any other URL (a local
// asset, another host, an already-transformed Cloudinary URL) is returned
// unchanged. Pure: no env, no network.

const CLOUDINARY_IMAGE_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/;
// The first path segment is a transformation when it looks like "w_800", "f_auto,q_auto", ...
const TRANSFORMATION_SEGMENT = /^[a-z]{1,3}_[^/]*\//;

export interface DeliveryOptions {
  /** Maximum width in CSS pixels; never upscales. */
  width?: number;
  /** Exact crop box, for fixed-size outputs like social cards. */
  height?: number;
  /** Force one format (e.g. "jpg" for renderers that cannot read AVIF/WebP). Defaults to auto. */
  format?: "auto" | "jpg" | "png" | "webp";
}

export function cloudinaryImageUrl(url: string, { width, height, format = "auto" }: DeliveryOptions = {}): string {
  const match = CLOUDINARY_IMAGE_UPLOAD.exec(url);
  if (!match) return url;
  const [, base, rest] = match;
  if (TRANSFORMATION_SEGMENT.test(rest)) return url;

  const parts = [`f_${format}`, "q_auto"];
  if (width) parts.push(`w_${Math.round(width)}`);
  if (height) parts.push(`h_${Math.round(height)}`);
  if (width || height) parts.push(height ? "c_fill,g_auto" : "c_limit");
  return `${base}${parts.join(",")}/${rest}`;
}

/** `srcset` for a Cloudinary image at the given widths, or undefined for any other URL. */
export function cloudinarySrcSet(url: string, widths: readonly number[]): string | undefined {
  if (!CLOUDINARY_IMAGE_UPLOAD.test(url)) return undefined;
  return widths.map((width) => `${cloudinaryImageUrl(url, { width })} ${width}w`).join(", ");
}
