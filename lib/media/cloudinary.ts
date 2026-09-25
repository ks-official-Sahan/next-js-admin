import "server-only";

import { env } from "@/lib/env";

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

  // Delete asset from Cloudinary
  async deleteAsset(publicId: string): Promise<boolean> {
    if (!this.apiKey || !this.apiSecret || !this.cloudName) {
      throw new Error("Cloudinary credentials not configured");
    }

    try {
      const url = `https://api.cloudinary.com/v1_1/${this.cloudName}/resources/image/destroy`;
      const body = new URLSearchParams({ public_id: publicId });

      const response = await this.fetchFn(url, {
        method: "POST",
        headers: {
          Authorization: this.authHeader(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      return response.ok;
    } catch {
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

      if (!response.ok) return null;
      return (await response.json()) as UploadBase64Result;
    } catch {
      return null;
    }
  }
}

export const cloudinary = new CloudinaryClient();
