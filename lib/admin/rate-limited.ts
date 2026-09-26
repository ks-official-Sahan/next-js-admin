import { NextResponse } from "next/server";

// 429 for the admin AI routes. The body carries the same { ok, error } shape
// as their other failures, so every caller's existing `data.error` display
// shows it, and the message says when to retry instead of a vague "wait a
// moment" on an hour-long window. Retry-After lets a client read the delay
// without parsing the text.

/** "Try again in 12 minutes." from the limiter's reset estimate; "shortly" when it has none. */
export function retryMessage(resetSeconds: number): string {
  if (!Number.isFinite(resetSeconds) || resetSeconds <= 0) return "Try again shortly.";
  if (resetSeconds < 60) return `Try again in ${Math.ceil(resetSeconds)} seconds.`;
  const minutes = Math.ceil(resetSeconds / 60);
  return `Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

export function rateLimitedResponse(resetSeconds: number, what = "AI request"): NextResponse {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (resetSeconds > 0) headers["Retry-After"] = String(Math.ceil(resetSeconds));
  return NextResponse.json({ ok: false, error: `${what} limit reached. ${retryMessage(resetSeconds)}` }, { status: 429, headers });
}
