"use client";

import { useCallback, useRef, useState } from "react";

// The chat widget's one network call. Deliberately plain fetch, not a client
// cache library: a chat turn is a one-off POST (nothing to cache or share),
// and the public site ships no data-fetching runtime to every visitor for it.
//
// Never retried automatically: by the time a request fails the server may
// already have stored the visitor's message and called the model, so a
// silent retry would duplicate both. The visitor retries by sending again.

const GENERIC_ERROR = "Sorry, I encountered an error. Please try again.";
const RATE_LIMITED = "Too many requests. Please wait a moment before trying again.";

async function postChat(sessionId: string, message: string): Promise<string> {
  const response = await fetch("/api/chat", {
    method: "POST",
    // A signed visitor cookie may be set server-side for rate limiting; it
    // must travel with every turn, so this is never weakened to "omit".
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message }),
  });
  const body = (await response.json().catch(() => null)) as { response?: string; error?: string } | null;
  if (response.ok && typeof body?.response === "string") return body.response;
  // 429 and 503 carry a message the visitor can act on; anything else stays generic.
  if (response.status === 429) throw new Error(body?.error || RATE_LIMITED);
  if (response.status === 503 && body?.error) throw new Error(body.error);
  throw new Error(GENERIC_ERROR);
}

/** Sends one chat turn; resolves to the assistant's reply or a visitor-facing error message. */
export function useChat(sessionId: string) {
  const [isPending, setIsPending] = useState(false);
  const inFlight = useRef(false);

  const send = useCallback(
    async (message: string): Promise<{ ok: true; reply: string } | { ok: false; error: string }> => {
      if (inFlight.current) return { ok: false, error: "Please wait for the current reply." };
      inFlight.current = true;
      setIsPending(true);
      try {
        return { ok: true, reply: await postChat(sessionId, message) };
      } catch (error) {
        return { ok: false, error: error instanceof Error && error.message ? error.message : GENERIC_ERROR };
      } finally {
        inFlight.current = false;
        setIsPending(false);
      }
    },
    [sessionId]
  );

  return { send, isPending };
}
