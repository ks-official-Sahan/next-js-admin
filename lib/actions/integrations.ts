"use server";

import { BUILTIN_ADAPTERS, checkChain, checkProvider } from "@sahan-sac/ai-core/adapters";

import { authorizeAction } from "@/lib/actions/guard";
import { hasPermission } from "@/lib/auth/dal";
import { describeAiCheck, type AiCheckView } from "@/lib/admin/ai-check";
import { auditSafe } from "@/lib/admin/audit";
import { limit } from "@/lib/cache/ratelimit";
import { getEnv } from "@/lib/env";

// Manual reachability check for one AI provider or one whole chain, from the
// Integration health panel's Check button. Sends ai-core's one-line
// CHECK_PROMPT, so it spends a few tokens: never run automatically, and
// rate limited in the same bucket as the other AI text tools.

export type AiCheckState = AiCheckView & { ok: boolean };

const CHAINS = { "chain:blog": "blog", "chain:chat": "chat" } as const;

export async function checkAiProviderAction(id: string): Promise<AiCheckState> {
  const auth = await authorizeAction("manageSettings");
  if (!auth.ok) return { ok: false, reachable: false, message: auth.error };
  // Integration health is security status as well.
  if (!hasPermission(auth.user, "viewSecurityStatus")) return { ok: false, reachable: false, message: "You do not have permission to do that." };

  const chain = typeof id === "string" && id in CHAINS ? CHAINS[id as keyof typeof CHAINS] : null;
  const adapter = chain ? null : BUILTIN_ADAPTERS.find((candidate) => candidate.id === id);
  if (!chain && !adapter) return { ok: false, reachable: false, message: "Unknown check." };

  if (!(await limit("ai:text:user", auth.user.id)).ok) {
    return { ok: false, reachable: false, message: "Too many AI requests. Wait a while and try again." };
  }

  let env;
  try {
    env = getEnv();
  } catch {
    return { ok: false, reachable: false, message: "The AI environment variables do not parse. Check the server log." };
  }
  const result = chain ? await checkChain(env, chain) : await checkProvider(env, adapter!.id);
  const view = describeAiCheck(result, chain ? `The ${chain} chain` : adapter!.label);

  await auditSafe({
    action: "integration.ai.checked",
    actor: auth.user,
    entityType: "Integration",
    entityId: result.id,
    meta: { ok: result.ok, reachable: view.reachable, provider: result.provider, errorClass: result.errorClass, ms: result.ms },
  });
  return { ok: true, ...view };
}
