import "server-only";

import { env } from "@/lib/env";
import { log } from "@/lib/log";

import { signCloudinaryUpload } from "./signature";

// Cloudinary Admin API client with injectable fetch for testing.
// All requests use HTTP Basic Auth (not signed URLs).
// Never log or print credentials.

export interface CloudinaryAsset {
  public_id: string;
  format: string;
  bytes: number;
  width?: number;
  height?: number;
  folder: string;
  secure_url: string;
  created_at: string;
}

export interface UploadBase64Result {
  public_id: string;
  format: string;
  bytes: number;
  width?: number;
  height?: number;
  folder: string;
  secure_url: string;
}

export type FetchFn = typeof fetch;

export class CloudinaryClient {
  private apiKey: string;
  private apiSecret: string;
  private cloudName: string;
  private fetchFn: FetchFn;

  constructor(fetchFn: FetchFn = fetch) {
    this.apiKey = env.CLOUDINARY_API_KEY || "";
    this.apiSecret = env.CLOUDINARY_API_SECRET || "";
    this.cloudName = env.CLOUDINARY_CLOUD_NAME || "";
    this.fetchFn = fetchFn;
  }

  private authHeader(): string {
    const credentials = Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString("base64");
    return `Basic ${credentials}`;
  }

  // Fetch asset metadata from Cloudinary Admin API
  async getAsset(publicId: string): Promise<CloudinaryAsset | null> {
    if (!this.apiKey || !this.apiSecret || !this.cloudName) {
      throw new Error("Cloudinary credentials not configured");
    }

    try {
      const url = `https://api.cloudinary.com/v1_1/${this.cloudName}/resources/image/${publicId}`;
      const response = await this.fetchFn(url, {
        method: "GET",
        headers: {
          Authorization: this.authHeader(),
        },
      });

      if (!response.ok) return null;
      return (await response.json()) as CloudinaryAsset;
    } catch {
      return null;
    }
  }

  // Delete asset from Cloudinary (Admin API: DELETE resources/image/upload).
  // True when it is gone, including when it was already gone.
  async deleteAsset(publicId: string): Promise<boolean> {
    if (!this.apiKey || !this.apiSecret || !this.cloudName) {
      throw new Error("Cloudinary credentials not configured");
    }

    try {
      const query = new URLSearchParams({ "public_ids[]": publicId });
      const url = `https://api.cloudinary.com/v1_1/${this.cloudName}/resources/image/upload?${query}`;
      const response = await this.fetchFn(url, { method: "DELETE", headers: { Authorization: this.authHeader() } });
      if (!response.ok) {
        log.warn("cloudinary delete failed", { status: response.status });
        return false;
      }
      const data = (await response.json()) as { deleted?: Record<string, string> };
      const state = data.deleted?.[publicId];
      return state === "deleted" || state === "not_found";
    } catch (error) {
      log.warn("cloudinary delete failed", { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  // Server-side upload for AI-generated images (lib/media/service.ts's
  // registerGeneratedImage): the admin never sees the bytes and there is no
  // browser file input, so this bypasses the unsigned-widget flow that
  // /api/admin/uploads/sign issues signatures for, and instead signs this one
  // upload request directly with the same HMAC helper that flow uses
  // (lib/media/signature.ts's signCloudinaryUpload), sending the image as a
  // base64 data URI in `file`.
  async uploadBase64(input: { dataUri: string; folder: string; publicId?: string }): Promise<UploadBase64Result | null> {
    if (!this.apiKey || !this.apiSecret || !this.cloudName) {
      throw new Error("Cloudinary credentials not configured");
    }

    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const paramsToSign: Record<string, string> = { folder: input.folder, timestamp };
      if (input.publicId) paramsToSign.public_id = input.publicId;
      const signature = signCloudinaryUpload(paramsToSign, this.apiSecret);

      const body = new URLSearchParams({
        file: input.dataUri,
        api_key: this.apiKey,
        timestamp,
        folder: input.folder,
        signature,
        ...(input.publicId ? { public_id: input.publicId } : {}),
      });

      const url = `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`;
      const response = await this.fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      if (!response.ok) {
        // Cloudinary's error text names the cause (for example "Invalid
        // Signature") and never contains the secret.
        const detail = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        log.warn("cloudinary upload failed", { status: response.status, error: detail?.error?.message?.slice(0, 200) });
        return null;
      }
      return (await response.json()) as UploadBase64Result;
    } catch (error) {
      log.warn("cloudinary upload failed", { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }
}

export const cloudinary = new CloudinaryClient();
