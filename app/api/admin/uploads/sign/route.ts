import { NextResponse, type NextRequest } from "next/server";

import { newObjectKey, presignBucketUpload } from "@sahan-sac/media-kit/bucket";
import { contentTypeFor, MEDIA_CONFIG } from "@sahan-sac/media-kit/config";
import { signCloudinaryUpload } from "@sahan-sac/media-kit/signature";
import { validateMediaUpload } from "@sahan-sac/media-kit/validation";

import { getOptionalUser, hasPermission } from "@/lib/auth/dal";
import { checkOrigin } from "@/lib/security/check-origin";
import { limit } from "@/lib/cache/ratelimit";
import { MEDIA_UPLOAD_FOLDER } from "@/lib/media/folder";
import { candidatesFor, isBucket, mediaStorage } from "@/lib/media/storage";

// GET /api/admin/uploads/sign?name=<file name>&size=<bytes>&skip=<id,id>
// Picks the storage account for one browser upload and returns what the
// browser needs to send the file straight there (media-kit/upload-client):
// - Cloudinary: signed params. `params` is exactly what was signed and must
//   be sent as-is, plus `file`, `api_key` and `signature`; allowed_formats
//   is signed, so Cloudinary itself refuses other types.
// - S3 / R2: a presigned PUT for a key the server chose, with the type and
//   exact size signed in, so the bucket refuses any other file.
// The first account in priority order that is not read-only, not marked
// full, under its soft cap and not in `skip` wins; the browser passes `skip`
// when an account it was sent to failed. registerUpload re-checks folder,
// type and size on the account itself before the asset is recorded.
// Requires uploadMedia permission and passes origin checks.

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const notFound = () => new NextResponse(null, { status: 404, headers: NO_STORE });
const forbidden = () => new NextResponse(null, { status: 403, headers: NO_STORE });
const refuse = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });

const MAX_SKIP = 32;

export async function GET(request: NextRequest) {
  const user = await getOptionalUser();
  if (!user || user.mustChangePassword) return notFound();
  if (!hasPermission(user, "uploadMedia")) return notFound();

  if (!checkOrigin(request.headers, request)) return forbidden();

  // Per user, generous: one upload may sign more than once while it fails over.
  const limited = await limit("upload:sign:user", user.id);
  if (!limited.ok) return new NextResponse(null, { status: 429, headers: NO_STORE });

  if (mediaStorage().accounts.length === 0) return refuse(503, "Media uploads are not configured on this server.");

  const search = request.nextUrl.searchParams;
  const name = search.get("name") ?? "";
  const size = Number(search.get("size") ?? "");
  const skip = (search.get("skip") ?? "").split(",").filter(Boolean).slice(0, MAX_SKIP);
  // Without a name and size (an older client) only Cloudinary can take the
  // file: a bucket upload needs both signed in up front.
  const described = name !== "" && Number.isInteger(size) && size > 0;

  let format: string | null = null;
  if (described) {
    const checked = validateMediaUpload(name, size, MEDIA_UPLOAD_FOLDER);
    if (!checked.ok) return refuse(400, checked.errors?.[0]?.message ?? "This file cannot be uploaded.");
    format = name.toLowerCase().split(".").pop() ?? null;
  }

  const candidates = (await candidatesFor(described ? size : 0, skip)).filter((account) => described || !isBucket(account));
  const account = candidates[0];
  if (!account) {
    return refuse(507, skip.length > 0 ? "No other storage account could take this file. Try again later." : "Media storage is full. Add or free a storage account.");
  }

  if (isBucket(account)) {
    const contentType = format ? contentTypeFor(format) : null;
    if (!format || !contentType) return refuse(400, "This file type cannot be uploaded.");
    const key = newObjectKey(MEDIA_UPLOAD_FOLDER, format);
    const upload = presignBucketUpload(account, { key, contentType, bytes: size });
    return NextResponse.json(
      {
        ok: true,
        provider: account.provider,
        accountId: account.id,
        key,
        uploadUrl: upload.url,
        headers: upload.headers,
        folder: MEDIA_UPLOAD_FOLDER,
        maxSizeBytes: MEDIA_CONFIG.images.maxSizeBytes,
      },
      { headers: NO_STORE }
    );
  }

  const params = {
    folder: MEDIA_UPLOAD_FOLDER,
    allowed_formats: [...MEDIA_CONFIG.images.formats, ...MEDIA_CONFIG.documents.formats].join(","),
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  return NextResponse.json(
    {
      ok: true,
      provider: "cloudinary",
      accountId: account.id,
      // The API key identifies the account (it is not the secret); Cloudinary
      // needs it on every signed upload.
      cloudName: account.cloudName,
      apiKey: account.apiKey,
      params,
      signature: signCloudinaryUpload(params, account.apiSecret),
      folder: MEDIA_UPLOAD_FOLDER,
      maxSizeBytes: MEDIA_CONFIG.images.maxSizeBytes,
    },
    { headers: NO_STORE }
  );
}
