import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Endpoint signing secrets are shown once and stored encrypted (AES-256-GCM),
// never hashed: the server must read them back to sign each delivery. The
// key is derived from INTERNAL_SIGNING_SECRET, passed in by the caller, so
// this module never reads env and rotating that secret needs no code change
// (endpoints then need a new secret: "Rotate secret" in the admin).

const INFO = "sahan/webhook-secret/v1";

function key(master: string): Buffer {
  return Buffer.from(hkdfSync("sha256", master, "", INFO, 32));
}

export function newWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

export function sealSecret(secret: string, master: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(master), iv);
  const body = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), body].map((part) => (typeof part === "string" ? part : part.toString("base64url"))).join(".");
}

/** Throws when the cipher was made with another key or was altered. */
export function openSecret(sealed: string, master: string): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unknown webhook secret format.");
  const decipher = createDecipheriv("aes-256-gcm", key(master), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
