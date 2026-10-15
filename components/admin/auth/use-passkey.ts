"use client";

import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";

import { passkeySupportFor, PREPARED_OPTIONS_MAX_AGE_MS, type PasskeySupport } from "@/lib/auth/passkey-browser";

const noSubscription = () => () => {};

/** Whether passkeys can work on this page; null while server-rendering and hydrating. */
export function usePasskeySupport(rpId: string): PasskeySupport | null {
  return useSyncExternalStore(
    noSubscription,
    () => passkeySupportFor({ secure: window.isSecureContext, webauthn: browserSupportsWebAuthn(), hostname: window.location.hostname }, rpId),
    () => null
  );
}

/**
 * Fetches a passkey ceremony's options ahead of the tap while `key` is set,
 * so the click handler can open the WebAuthn prompt before any await: Safari
 * (iOS above all) refuses the prompt once the tap's user activation has
 * lapsed behind a network round trip, which looked like an instant "prompt
 * closed". `take()` hands over fresh options once (each set is single use),
 * or null when none are ready and the caller fetches inline as before.
 * `refresh()` fetches the next set; call it once the whole attempt, server
 * check included, has settled, so no fetch runs (or counts against a rate
 * limit) while an attempt is still in flight.
 */
export function usePreparedOptions<T>(key: string | null, load: () => Promise<T | null>): { take: () => T | null; refresh: () => void } {
  const [prepared, setPrepared] = useState<{ key: string; value: T; at: number } | null>(null);
  const [round, setRound] = useState(0);
  const fetchOptions = useEffectEvent(load);

  useEffect(() => {
    if (!key) return;
    let live = true;
    fetchOptions()
      .then((value) => {
        if (live && value) setPrepared({ key, value, at: Date.now() });
      })
      // The tap fetches again and shows that error.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [key, round]);

  return {
    take(): T | null {
      const fresh = prepared !== null && prepared.key === key && Date.now() - prepared.at < PREPARED_OPTIONS_MAX_AGE_MS;
      setPrepared(null);
      return fresh ? prepared.value : null;
    },
    refresh: () => setRound((count) => count + 1),
  };
}
