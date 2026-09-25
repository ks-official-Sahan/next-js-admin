"use server";

import { revalidatePath } from "next/cache";

import { authorizeAction } from "@/lib/actions/guard";
import { done, fail, type ActionState } from "@/lib/actions/state";
import { auditSafe } from "@/lib/admin/audit";
import { collectIndexableUrls, isIndexNowConfigured, pingIndexNowWithStatus } from "@/lib/seo/indexnow";
import { regenerateLlmsTxt } from "@/lib/seo/llms-txt";

// Server actions backing the Settings screen's SEO tools section: llms.txt
// regeneration, sitemap revalidation, and IndexNow pings. Every mutation
// authorizes first, matching the pattern in lib/actions/settings.ts.

const ADMIN_SETTINGS_PATH = "/admin/settings";

export async function regenerateLlmsTxtAction(_previous: ActionState, _formData: FormData): Promise<ActionState> {
  const authz = await authorizeAction("manageSettings");
  if (!authz.ok) return fail(authz.error);

  const content = await regenerateLlmsTxt(authz.user);
  // regenerateLlmsTxt() already saves and audits the underlying setting
  // transactionally; this is a second, higher-level event, so an audit
  // failure here must not report an already-successful regeneration as failed.
  await auditSafe({
    action: "seo.llmsTxt.regenerated",
    actor: { id: authz.user.id, email: authz.user.email },
    entityType: "Setting",
    entityId: "seo.llmsTxt",
    meta: { bytes: content.length },
  });
  revalidatePath("/llms.txt");
  revalidatePath(ADMIN_SETTINGS_PATH);
  return done(`llms.txt regenerated (${content.length} bytes).`);
}

/** The sitemap (app/sitemap.ts) is already fully dynamic per request, so
 * "regenerate" is a cache revalidation, not a file rebuild. */
export async function regenerateSitemapAction(_previous: ActionState, _formData: FormData): Promise<ActionState> {
  const authz = await authorizeAction("manageSettings");
  if (!authz.ok) return fail(authz.error);

  revalidatePath("/sitemap.xml");
  await auditSafe({
    action: "seo.sitemap.regenerated",
    actor: { id: authz.user.id, email: authz.user.email },
    entityType: "Setting",
  });
  revalidatePath(ADMIN_SETTINGS_PATH);
  return done("Sitemap revalidated.");
}

export async function pingIndexNowAction(_previous: ActionState, _formData: FormData): Promise<ActionState> {
  const authz = await authorizeAction("manageSettings");
  if (!authz.ok) return fail(authz.error);

  if (!isIndexNowConfigured()) return fail("INDEXNOW_KEY is not configured.");

  const urls = await collectIndexableUrls();
  const result = await pingIndexNowWithStatus(urls);

  await auditSafe({
    action: "seo.indexnow.pinged",
    actor: { id: authz.user.id, email: authz.user.email },
    entityType: "Setting",
    meta: { submitted: result.submitted, endpoints: result.endpoints },
  });
  revalidatePath(ADMIN_SETTINGS_PATH);

  const failed = result.endpoints.filter((endpoint) => !endpoint.ok);
  if (failed.length > 0) {
    const detail = failed.map((endpoint) => `${endpoint.name} (HTTP ${endpoint.status ?? "no response"})`).join(", ");
    // indexnow.org verifies keyLocation synchronously by fetching
    // public/<key>.txt from the live site before it returns 200/202 — this
    // fails until that file is actually deployed to production, which is a
    // deployment-state issue, not a bad request.
    return fail(
      `Pinged ${result.submitted} URL(s), but ${detail} failed. If this is indexnow.org, confirm the key file is live at https://<site>/<key>.txt on production first.`
    );
  }
  return done(`Pinged ${result.submitted} URL(s) to ${result.endpoints.map((endpoint) => endpoint.name).join(" and ")}.`);
}
