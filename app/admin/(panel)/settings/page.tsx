import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import AiContextForm from "@/components/admin/settings/AiContextForm";
import ChatbotConfigForm from "@/components/admin/settings/ChatbotConfigForm";
import ClearCacheButton from "@/components/admin/settings/ClearCacheButton";
import CronManager from "@/components/admin/settings/CronManager";
import EmailRoutingForm from "@/components/admin/settings/EmailRoutingForm";
import FeaturesForm from "@/components/admin/settings/FeaturesForm";
import IntegrationHealthPanel from "@/components/admin/settings/IntegrationHealthPanel";
import IpAllowlistForm from "@/components/admin/settings/IpAllowlistForm";
import MaintenanceForm from "@/components/admin/settings/MaintenanceForm";
import SeoToolsPanel from "@/components/admin/settings/SeoToolsPanel";
import SettingsNav from "@/components/admin/settings/SettingsNav";
import { getCachedIntegrationHealth } from "@/lib/admin/integrations";
import { bypassKeysFromEnv } from "@/lib/admin/maintenance-bypass";
import { hasPermission, requireUser } from "@/lib/auth/dal";
import { getKnownIps } from "@/lib/auth/session-store";
import { getEnv } from "@/lib/env";
import { clientIp } from "@/lib/security/ip";
import { isIndexNowConfigured } from "@/lib/seo/indexnow";
import { getSetting } from "@/lib/settings/service";

export const metadata: Metadata = {
  title: { absolute: "Settings - Admin" },
};

interface SectionSpec {
  id: string;
  title: string;
  /** Shorter label for the section navigation. */
  nav: string;
  description: string;
  content: ReactNode;
}

// Every mutation on this screen requires DEVELOPER-only permissions
// (manageSettings, manageIpAllowlist, clearSystemCache); manageCron is also
// held by MANAGER by default, so the page itself opens for anyone holding at
// least one of the four, and renders only the sections that permission
// covers. Integration health pings external services, so it streams in
// behind a Suspense boundary instead of holding up the rest of the page.
// Design notes, Step 16.
export default async function SettingsPage() {
  const user = await requireUser();

  const canManageSettings = hasPermission(user, "manageSettings");
  const canManageAllowlist = hasPermission(user, "manageIpAllowlist");
  const canClearCache = hasPermission(user, "clearSystemCache");
  const canManageCron = hasPermission(user, "manageCron");

  if (!canManageSettings && !canManageAllowlist && !canClearCache && !canManageCron) notFound();

  const [features, maintenance, ipAllowlist, chatbotConfig, emailRouting, aiContext, requestHeaders, knownIps] = await Promise.all([
    canManageSettings ? getSetting("features") : Promise.resolve(null),
    canManageSettings ? getSetting("maintenance") : Promise.resolve(null),
    canManageAllowlist ? getSetting("security.ipAllowlist") : Promise.resolve(null),
    canManageSettings ? getSetting("chatbot.config") : Promise.resolve(null),
    canManageSettings ? getSetting("email.routing") : Promise.resolve(null),
    canManageSettings ? getSetting("ai.context") : Promise.resolve(null),
    headers(),
    canManageAllowlist ? getKnownIps() : Promise.resolve([]),
  ]);

  const callerIp = clientIp(requestHeaders);

  const sections: (SectionSpec | false | null)[] = [
    canManageSettings &&
      features && {
        id: "features",
        title: "Feature flags",
        nav: "Features",
        description: "Control which features are active on the public site.",
        content: <FeaturesForm value={features} />,
      },
    canManageSettings &&
      maintenance && {
        id: "maintenance",
        title: "Maintenance mode",
        nav: "Maintenance",
        description: "Put the public site into maintenance while /admin, /api/admin and /api/cron keep working.",
        content: <MaintenanceForm value={maintenance} bypassConfigured={bypassKeysFromEnv() !== null} />,
      },
    canManageAllowlist &&
      ipAllowlist && {
        id: "ip-allowlist",
        title: "Admin IP allowlist",
        nav: "IP allowlist",
        description: "Restrict /admin and /api/admin to specific addresses.",
        content: (
          <IpAllowlistForm
            value={ipAllowlist}
            callerIp={callerIp}
            knownIps={knownIps.map((known) => ({ ...known, lastSeenAt: known.lastSeenAt.toISOString() }))}
          />
        ),
      },
    canManageSettings &&
      chatbotConfig && {
        id: "chatbot",
        title: "Chatbot",
        nav: "Chatbot",
        description: "Tone, greeting and the on/off switch the chatbot widget reads.",
        content: <ChatbotConfigForm value={chatbotConfig} />,
      },
    canManageSettings &&
      aiContext && {
        id: "ai-context",
        title: "AI context",
        nav: "AI context",
        description: "Standing guidance the AI features follow: everywhere, then the blog assistant, SEO suggestions and the chatbot.",
        content: <AiContextForm value={aiContext} />,
      },
    canManageSettings &&
      emailRouting && {
        id: "email-routing",
        title: "Email routing",
        nav: "Email routing",
        description: "Override where contact form notifications and replies go.",
        content: <EmailRoutingForm value={emailRouting} copyRecipients={getEnv().EMAIL_CC.length} />,
      },
    canManageSettings && {
      id: "integrations",
      title: "Integration health",
      nav: "Integrations",
      description: "Configured status and a live check for each external service. No secret is ever shown.",
      content: (
        <Suspense fallback={<HealthSkeleton />}>
          <IntegrationHealth />
        </Suspense>
      ),
    },
    canManageSettings && {
      id: "seo-tools",
      title: "SEO tools",
      nav: "SEO tools",
      description: "Regenerate llms.txt, revalidate the sitemap, and ping IndexNow (Bing + indexnow.org) with every public URL.",
      content: <SeoToolsPanel indexNowConfigured={isIndexNowConfigured()} />,
    },
    canClearCache && {
      id: "cache",
      title: "Cache",
      nav: "Cache",
      description: "Invalidate every cache tag and re-sync the maintenance and allowlist mirrors read by the proxy.",
      content: <ClearCacheButton />,
    },
    (canManageCron || canManageSettings) && {
      id: "scheduled-jobs",
      title: "Scheduled jobs",
      nav: "Scheduled jobs",
      description: "Run a cron job now instead of waiting for its daily schedule.",
      content: <CronManager canRunCron={canManageCron} canRunAuditPrune={canManageSettings} />,
    },
  ];
  const visible = sections.filter((section): section is SectionSpec => Boolean(section));

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Site-wide configuration. Most of this screen is DEVELOPER only, and every change is audited.
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10">
        <SettingsNav items={visible.map(({ id, nav }) => ({ id, label: nav }))} />
        <div className="min-w-0 max-w-4xl space-y-12 pb-40">
          {visible.map((section) => (
            <Section key={section.id} id={section.id} title={section.title} description={section.description}>
              {section.content}
            </Section>
          ))}
        </div>
      </div>
    </div>
  );
}

async function IntegrationHealth() {
  return <IntegrationHealthPanel statuses={await getCachedIntegrationHealth()} />;
}

function HealthSkeleton() {
  return (
    <div aria-busy="true" aria-label="Checking integrations" className="space-y-2">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="h-10 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      ))}
    </div>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-32 border-b border-border pb-8 last:border-0 lg:scroll-mt-20">
      <h2 id={`${id}-title`} className="mb-1 text-lg font-semibold">
        {title}
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}
