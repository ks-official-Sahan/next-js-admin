import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

import { purgeRedisTag } from "./cached";
import type { InvalidationPlan } from "./plan";

/**
 * Applies an invalidation plan. Call it from a Server Action or a Route
 * Handler only: revalidateTag and revalidatePath do not work in Client
 * Components or the proxy.
 *
 * Tags use the "max" profile (stale-while-revalidate): the old page keeps being
 * served while the new one builds, so a database blip during regeneration never
 * blanks the public site. `{ expire: 0 }` is deliberately not used for public
 * tags (design notes, section 5.1 and R16).
 */
export function invalidate(plan: InvalidationPlan): void {
  const tags = new Set(plan.tags);
  for (const tag of tags) {
    revalidateTag(tag, "max");
  }
  for (const entry of plan.paths) {
    if (typeof entry === "string") revalidatePath(entry);
    else revalidatePath(entry.path, entry.type);
  }
  // Best-effort and non-blocking: also purge cached.ts's Redis read-through
  // layer for these tags, so a publish is visible immediately instead of
  // waiting out that layer's short TTL. Never awaited: invalidate() is
  // called synchronously from ~30 Server Actions and must not add latency
  // to the response they return.
  for (const tag of tags) {
    void purgeRedisTag(tag).catch(() => {});
  }
}
