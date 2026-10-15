import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

import { log } from "@/lib/log";
import { notifyContentChanged } from "@/lib/webhooks/dispatch";

import { purgeRedisTag } from "./cached";
import type { InvalidationPlan } from "./plan";

/**
 * Applies an invalidation plan. Call it from a Server Action or a Route
 * Handler only: revalidateTag and revalidatePath do not work in Client
 * Components or the proxy. Await it before returning the action's result.
 *
 * Order matters. cached.ts's Redis read-through layer is purged first (a new
 * generation per tag), and only then are the Next tags and paths revalidated.
 * Revalidating first would let a regeneration that starts in between read the
 * pre-purge Redis value and write it back into the data cache for a full
 * revalidate window. The purge is one parallel Redis round trip; a failed
 * purge is logged and the Next revalidation still runs. The wait is bounded:
 * every Upstash call goes through FailoverKv (lib/cache/redis.ts), which
 * times out after 1.5 s and fails over to memory, so a hung request cannot
 * hold a save open.
 *
 * Tags use the "max" profile (stale-while-revalidate): the old page keeps being
 * served while the new one builds, so a database blip during regeneration never
 * blanks the public site. `{ expire: 0 }` is deliberately not used for public
 * tags (design notes, section 5.1 and R16).
 */
export async function invalidate(plan: InvalidationPlan): Promise<void> {
  const tags = [...new Set(plan.tags)];
  const purged = await Promise.allSettled(tags.map((tag) => purgeRedisTag(tag)));
  purged.forEach((result, index) => {
    if (result.status === "rejected") log.warn("redis cache purge failed", { tag: tags[index], error: String(result.reason) });
  });
  for (const tag of tags) {
    revalidateTag(tag, "max");
  }
  for (const entry of plan.paths) {
    if (typeof entry === "string") revalidatePath(entry);
    else revalidatePath(entry.path, entry.type);
  }
  // Headless consumers get the same refresh as a signed "content.changed"
  // webhook, sent after the response (lib/webhooks/dispatch.ts).
  notifyContentChanged(plan);
}
