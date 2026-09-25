import "server-only";

import { db } from "@/lib/db/prisma";

// Seed existing /public/works/* images as LOCAL media assets.
// This makes day one look identical to today by registering existing files.
// Idempotent: calling it multiple times is safe.

interface LocalAsset {
  url: string;
  alt: string;
  title?: string;
  folder: string;
}

const LOCAL_ASSETS: LocalAsset[] = [
  // Add assets from public/works here as discovered
  // Format: { url: "/works/image.jpg", alt: "...", title: "...", folder: "works" }
];

export async function seedMediaAssets(): Promise<void> {
  for (const asset of LOCAL_ASSETS) {
    const existing = await db.mediaAsset.findFirst({
      where: { url: asset.url, provider: "LOCAL" },
    });

    if (!existing) {
      await db.mediaAsset.create({
        data: {
          provider: "LOCAL",
          kind: "IMAGE",
          url: asset.url,
          format: asset.url.split(".").pop() || "jpg",
          sizeBytes: 0, // Unknown for local files
          alt: asset.alt || "",
          title: asset.title || "",
          folder: asset.folder,
        },
      });
      console.log(`Seeded local asset: ${asset.url}`);
    }
  }

  console.log("Media seed complete.");
}
