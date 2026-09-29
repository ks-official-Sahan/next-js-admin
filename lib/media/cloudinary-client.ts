import "server-only";

import { CloudinaryClient, cloudinaryConfigFromEnv } from "@sahan-sac/media-kit/cloudinary";

import { getEnv } from "@/lib/env";
import { log } from "@/lib/log";

// App-side singleton: @sahan-sac/media-kit/cloudinary is headless and takes
// its credentials and logger as constructor arguments, so this is the one
// place that resolves them from the app's env and log modules. Missing
// credentials are not an error here — the client throws on first use
// (getAsset/deleteAsset/uploadBase64), matching the package's own contract.
export const cloudinary = new CloudinaryClient({
  ...(cloudinaryConfigFromEnv(getEnv()) ?? { cloudName: "", apiKey: "", apiSecret: "" }),
  onWarn: (message, meta) => log.warn(message, meta),
});
