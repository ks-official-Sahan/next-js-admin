import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import ChatbotConfigForm from "@/components/admin/settings/ChatbotConfigForm";
import ClearCacheButton from "@/components/admin/settings/ClearCacheButton";
import CronManager from "@/components/admin/settings/CronManager";
import EmailRoutingForm from "@/components/admin/settings/EmailRoutingForm";
import FeaturesForm from "@/components/admin/settings/FeaturesForm";
import IntegrationHealthPanel from "@/components/admin/settings/IntegrationHealthPanel";
import IpAllowlistForm from "@/components/admin/settings/IpAllowlistForm";
import MaintenanceForm from "@/components/admin/settings/MaintenanceForm";
import SeoToolsPanel from "@/components/admin/settings/SeoToolsPanel";
import { getIntegrationHealth } from "@/lib/admin/integrations";
import { hasPermission, requireUser } from "@/lib/auth/dal";
import { getKnownIps } from "@/lib/auth/session-store";
import { clientIp } from "@/lib/security/ip";
import { isIndexNowConfigured } from "@/lib/seo/indexnow";
import { getSetting } from "@/lib/settings/service";

export const metadata: Metadata = {
  title: { absolute: "Settings - Admin" },
};

// Every mutation on this screen requires DEVELOPER-only permissions
// (manageSettings, manageIpAllowlist, clearSystemCache); manageCron is also
// held by MANAGER by default, so the page itself opens for anyone holding at
// least one of the four, and renders only the sections that permission
// covers. Design notes, Step 16.
export default async function SettingsPage() {
  const user = await requireUser();

  const canManageSettings = hasPermission(user, "manageSettings");
  const canManageAllowlist = hasPermission(user, "manageIpAllowlist");
  const canClearCache = hasPermission(user, "clearSystemCache");
  const canManageCron = hasPermission(user, "manageCron");

  if (!canManageSettings && !canManageAllowlist && !canClearCache && !canManageCron) notFound();

  const [features, maintenance, ipAllowlist, chatbotConfig, emailRouting, health, requestHeaders, knownIps] = await Promise.all([
    canManageSettings ? getSetting("features") : Promise.resolve(null),
    canManageSettings ? getSetting("maintenance") : Promise.resolve(null),
    canManageAllowlist ? getSetting("security.ipAllowlist") : Promise.resolve(null),
    canManageSettings ? getSetting("chatbot.config") : Promise.resolve(null),
    canManageSettings ? getSetting("email.routing") : Promise.resolve(null),
    canManageSettings ? getIntegrationHealth() : Promise.resolve(null),
    headers(),
    canManageAllowlist ? getKnownIps() : Promise.resolve([]),
  ]);

  const callerIp = clientIp(requestHeaders);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Site-wide configuration. Most of this screen is DEVELOPER only, and every change is audited.
        </p>
      </div>

      <div className="space-y-12">
        {canManageSettings && features ? (
          <Section title="Feature flags" description="Control which features are active on the public site.">
            <FeaturesForm value={features} />
          </Section>
        ) : null}

        {canManageSettings && maintenance ? (
          <Section
            title="Maintenance mode"
            description="Put the public site into maintenance while /admin, /api/admin and /api/cron keep working."
          >
            <MaintenanceForm value={maintenance} bypassConfigured={Boolean(process.env.MAINTENANCE_BYPASS_SECRET)} />
          </Section>
        ) : null}

        {canManageAllowlist && ipAllowlist ? (
          <Section title="Admin IP allowlist" description="Restrict /admin and /api/admin to specific addresses.">
            <IpAllowlistForm
              value={ipAllowlist}
              callerIp={callerIp}
              knownIps={knownIps.map((known) => ({ ...known, lastSeenAt: known.lastSeenAt.toISOString() }))}
            />
          </Section>
        ) : null}

        {canManageSettings && chatbotConfig ? (
          <Section title="Chatbot" description="Tone, greeting and the on/off switch the chatbot widget reads.">
            <ChatbotConfigForm value={chatbotConfig} />
          </Section>
        ) : null}

        {canManageSettings && emailRouting ? (
          <Section title="Email routing" description="Override where contact form notifications and replies go.">
            <EmailRoutingForm value={emailRouting} />
          </Section>
        ) : null}

        {canManageSettings && health ? (
          <Section
            title="Integration health"
            description="Configured status and a live ping for each external service. No secret is ever shown."
          >
            <IntegrationHealthPanel statuses={health} />
          </Section>
        ) : null}

        {canManageSettings ? (
          <Section
            title="SEO tools"
            description="Regenerate llms.txt, revalidate the sitemap, and ping IndexNow (Bing + indexnow.org) with every public URL."
          >
            <SeoToolsPanel indexNowConfigured={isIndexNowConfigured()} />
          </Section>
        ) : null}

        {canClearCache ? (
          <Section
            title="Cache"
            description="Invalidate every cache tag and re-sync the maintenance and allowlist mirrors read by the proxy."
          >
            <ClearCacheButton />
          </Section>
        ) : null}

        {canManageCron || canManageSettings ? (
          <Section title="Scheduled jobs" description="Run a cron job now instead of waiting for its daily schedule.">
            <CronManager canRunCron={canManageCron} canRunAuditPrune={canManageSettings} />
          </Section>
        ) : null}
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="border-b border-border pb-8 last:border-0">
      <h2 className="mb-1 text-lg font-semibold">{title}</h2>
      <p className="mb-6 text-sm text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}
