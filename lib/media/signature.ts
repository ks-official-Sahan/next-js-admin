import { createHmac, timingSafeEqual } from "crypto";

// HMAC-SHA256 signing and verification for /media URLs.
// Uses constant-time comparison to prevent timing attacks.
// Secrets passed as parameters, never read from env inside functions.

interface SignParams {
  mediaId: string;
  width?: number;
  quality?: number;
}

export function signMediaUrl(params: SignParams, secret: string | undefined): string {
  if (!secret) throw new Error("MEDIA_SIGNING_SECRET not configured");

  const parts = [params.mediaId, params.width || "", params.quality || ""];
  const message = parts.join("|");

  const hmac = createHmac("sha256", secret);
  hmac.update(message);
  return hmac.digest("hex");
}

export function verifyMediaSignature(
  params: SignParams,
  providedSignature: string,
  secret: string | undefined
): boolean {
  if (!providedSignature || !secret) return false;

  try {
    const expected = signMediaUrl(params, secret);
    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(providedSignature);

    // Constant-time comparison to prevent timing attacks
    if (expectedBuf.length !== providedBuf.length) return false;
    return timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
}

// For Cloudinary upload signing (OAuth not available, so direct param signing)
export function signCloudinaryUpload(params: Record<string, string>, secret: string | undefined): string {
  if (!secret) throw new Error("CLOUDINARY_API_SECRET not configured");

  // Sort params and build string: "key1=value1&key2=value2&..."
  const sortedKeys = Object.keys(params).sort();
  const message = sortedKeys.map((k) => `${k}=${params[k]}`).join("&");

  const hmac = createHmac("sha1", secret);
  hmac.update(message);
  return hmac.digest("hex");
}
