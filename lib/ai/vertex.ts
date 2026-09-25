import "server-only";

// Google Vertex AI, called directly over REST with a service-account JWT,
// the same "thin adapter, no extra SDK" style as geminiProvider in
// lib/ai/providers.ts. No @google-cloud/* or @ai-sdk/google-vertex package
// is added; a JWT bearer-token exchange is ~30 lines with Node's built-in
// crypto, and this project already has GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY
// configured (previously unused — declared in lib/env.ts, never called).

export interface VertexServiceAccount {
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
}

interface CachedToken {
  accessToken: string;
  /** Epoch ms; refreshed 60s before this to avoid a request racing expiry. */
  expiresAt: number;
}

// One process-wide cache: every call reuses the token until it is near
// expiry instead of signing a fresh JWT and round-tripping to Google on
// every AI request.
let cachedToken: CachedToken | null = null;

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Signs a Google OAuth2 service-account JWT and exchanges it for an access token. */
export async function getVertexAccessToken(
  account: VertexServiceAccount,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) return cachedToken.accessToken;

  const { createSign } = await import("node:crypto");
  const issuedAt = Math.floor(now / 1000);
  const expiresIn = 3600;

  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64UrlEncode(
    JSON.stringify({
      iss: account.clientEmail,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: account.tokenUri,
      iat: issuedAt,
      exp: issuedAt + expiresIn,
    })
  );
  const signingInput = `${header}.${claims}`;

  const signature = createSign("RSA-SHA256").update(signingInput).sign(account.privateKey);
  const jwt = `${signingInput}.${base64UrlEncode(signature)}`;

  const response = await fetchImpl(account.tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    throw new Error(`Vertex token exchange failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { accessToken: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return data.access_token;
}

/** Test helper: forget the cached token. */
export function resetVertexTokenCache(): void {
  cachedToken = null;
}
