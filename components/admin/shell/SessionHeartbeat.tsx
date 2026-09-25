"use client";

import { useEffect } from "react";

import { EXPIRE_PATH } from "@/lib/auth/constants";
import { heartbeatDecision, nextDelay, shouldPollOnFocus, type HeartbeatOutcome } from "@/lib/admin/heartbeat";

const STATUS_PATH = "/api/auth/session-status";

/**
 * Asks the server every 30 seconds, and when the tab comes back, whether this
 * session still counts. A session ended elsewhere (revoked, forced logout,
 * disabled account, changed password) then signs this tab out within 30 seconds
 * even though nobody is clicking (design notes, section 6.3).
 * The decisions are in lib/admin/heartbeat.ts, where they are unit tested.
 */
export default function SessionHeartbeat() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastCheckAt: number | null = Date.now();
    let retries = 0;
    let stopped = false;
    let running = false;

    const schedule = (outcome: HeartbeatOutcome) => {
      if (stopped) return;
      timer = setTimeout(check, nextDelay(outcome, retries));
    };

    async function check() {
      if (stopped || running) return;
      running = true;
      if (timer) clearTimeout(timer);

      let outcome: HeartbeatOutcome;
      try {
        const response = await fetch(STATUS_PATH, { cache: "no-store", credentials: "same-origin" });
        const body: { active?: unknown } | null = await response.json().catch(() => null);
        outcome = heartbeatDecision({ status: response.status, active: body?.active });
      } catch {
        outcome = heartbeatDecision(null);
      }
      running = false;
      lastCheckAt = Date.now();

      if (outcome === "expired") {
        stopped = true;
        // Clears the cookie and shows the login page.
        window.location.assign(EXPIRE_PATH);
        return;
      }
      retries = outcome === "retry" ? retries + 1 : 0;
      schedule(outcome);
    }

    const onVisible = () => {
      if (document.visibilityState === "visible" && shouldPollOnFocus(Date.now(), lastCheckAt)) void check();
    };

    schedule("ok");
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return null;
}
