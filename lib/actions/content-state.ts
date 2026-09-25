import type { ActionState } from "./state";

// What the section editor gets back from a content action. Not a "use server"
// module, so the type and the idle value can be shared with client code.

export interface ContentActionState extends ActionState {
  /** ISO `updatedAt` of the draft after a successful change. Sent back on the next save. */
  base?: string | null;
  /** True when the draft has been published by this action. */
  published?: boolean;
  /** True when someone else changed the section: the editor must reload. */
  conflict?: boolean;
}

export const idleContentState: ContentActionState = { ok: false, message: null, error: null };
