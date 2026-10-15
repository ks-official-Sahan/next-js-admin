import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import Icon from "@/components/icons/Icon";
import BarList from "@/components/admin/dashboard/BarList";
import RefreshButton from "@/components/admin/dashboard/RefreshButton";
import { RevealGroup, RevealItem } from "@/components/admin/dashboard/Reveal";
import StatTile from "@/components/admin/dashboard/StatTile";
import TrendChartLazy from "@/components/admin/dashboard/TrendChartLazy";
import { ANALYTICS_RANGES, parseRange, type AnalyticsRange, type Ranked, type SiteAnalytics } from "@sahan-sac/analytics-kit";
import {
  getActivitySeries,
  getContentCounts,
  getEmailHealth,
  getNewInquiries,
  getNewInquiriesCount,
  getPostPipeline,
  getRecentActivity,
  getRecentChatCount,
  getSecurityCounts,
  getSiteAnalytics,
  getSystemHealth,
  getUserSecurityStatus,
  type ActivitySeries,
  type Probe,
} from "@/lib/admin/dashboard";
import {
  FOCUS_SUBTITLE,
  planDashboard,
  quickActionsFor,
  tilesFor,
  type DashboardCan,
  type TileId,
  type WidgetId,
  type WidgetSpan,
} from "@/lib/admin/dashboard-plan";
import { formatDateTime, relativeTime } from "@/lib/admin/format";
import { requirePermission, type AuthUser } from "@/lib/auth/dal";
import { authAdapter } from "@/lib/data";
import type { DailyCounts, DashboardPostStatus } from "@/lib/data/maintenance";

// A title template does not apply to the page in the same segment as the layout
// that defines it, so the dashboard spells out its full title.
export const metadata: Metadata = { title: { absolute: "Dashboard - Admin" } };

// Read outside the components: a server render is one request, and this is its clock.
const clock = () => Date.now();

type SeriesKey = keyof Omit<DailyCounts, "day">;

// The dashboard streams: the header paints at once and each widget fills in
// as its own queries answer, so one slow probe never holds up the rest.
// lib/admin/dashboard-plan.ts decides which widgets the viewer sees and in
// what order: permissions decide what may be shown, the role decides what
// comes first. Only the queries for the widgets shown are run, and each one
// tolerates a missing database or Redis.
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const user = await requirePermission("viewDashboard");
  const plan = planDashboard(user);
  const { can } = plan;
  const range = parseRange((await searchParams).range);
  const now = clock();

  const seriesKeys = [can.leads && "inquiries", can.content && "posts", can.audit && "activity"].filter(Boolean) as SeriesKey[];
  const series = seriesKeys.length > 0 ? getActivitySeries(user) : Promise.resolve(null);
  const analytics = can.analytics ? getSiteAnalytics(range) : Promise.resolve(null);
  const tiles = tilesFor(plan);

  const widget: Record<WidgetId, () => ReactNode> = {
    quickActions: () => <QuickActions user={user} />,
    analytics: () => (
      <Suspense fallback={<PanelSkeleton height="h-[36rem]" />}>
        <AnalyticsPanel analytics={analytics} range={range} />
      </Suspense>
    ),
    trend: () => (
      <Suspense fallback={<PanelSkeleton height="h-80" />}>
        <TrendPanel series={series} keys={seriesKeys} />
      </Suspense>
    ),
    health: () => (
      <Suspense fallback={<PanelSkeleton height="h-80" />}>
        <HealthPanel />
      </Suspense>
    ),
    security: () => (
      <Suspense fallback={<PanelSkeleton height="h-64" />}>
        <SecurityPanel can={can} now={now} />
      </Suspense>
    ),
    activity: () => (
      <Suspense fallback={<PanelSkeleton height="h-64" />}>
        <ActivityPanel user={user} />
      </Suspense>
    ),
    pipeline: () => (
      <Suspense fallback={<PanelSkeleton height="h-64" />}>
        <PipelinePanel now={now} />
      </Suspense>
    ),
    inbox: () => (
      <Suspense fallback={<PanelSkeleton height="h-64" />}>
        <InboxPanel can={can} now={now} />
      </Suspense>
    ),
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">{FOCUS_SUBTITLE[plan.focus]}</p>
        </div>
        <RefreshButton />
      </header>

      <Suspense fallback={null}>
        <AccountAlerts user={user} />
      </Suspense>

      <Suspense fallback={<TilesSkeleton count={tiles.length} />}>
        <Tiles user={user} tiles={tiles} can={can} series={series} analytics={analytics} range={range} />
      </Suspense>

      <div className="grid gap-6 lg:grid-cols-6">
        {plan.widgets.map(({ id, span }) => (
          <div key={id} className={`min-w-0 ${SPAN_CLASS[span]}`}>
            {widget[id]()}
          </div>
        ))}
      </div>
    </div>
  );
}

// Literal class names, so Tailwind sees every one.
const SPAN_CLASS: Record<WidgetSpan, string> = {
  2: "lg:col-span-2",
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  6: "lg:col-span-6",
};

const numberFormat = new Intl.NumberFormat("en");
const compactFormat = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

// ─── sections ───────────────────────────────────────────────────────────────

async function AccountAlerts({ user }: { user: AuthUser }) {
  const [status, factors] = await Promise.all([getUserSecurityStatus(user.id), authAdapter.findMfaFactors(user.id).catch(() => null)]);
  const strong = Boolean(factors && (factors.totpEnabledAt || factors.passkeys > 0));
  const alerts: { title: string; body: string; href: string; action: string }[] = [];
  if (status.mustChangePassword) {
    alerts.push({ title: "Change your password", body: "An administrator set it for you.", href: "/admin/account", action: "Change it" });
  }
  if (!strong) {
    alerts.push({
      title: "Add an authenticator app or a passkey",
      body: "A strong second factor keeps this account safe if the password leaks.",
      href: "/admin/account#security",
      action: "Set it up",
    });
  }
  if (alerts.length === 0) return null;
  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <div
          key={alert.title}
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10"
        >
          <div className="flex items-start gap-3">
            <Icon name="triangle-alert" className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-medium text-amber-950 dark:text-amber-100">{alert.title}</p>
              <p className="text-amber-900/80 dark:text-amber-200/80">{alert.body}</p>
            </div>
          </div>
          <Link
            href={alert.href}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {alert.action}
          </Link>
        </div>
      ))}
    </div>
  );
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const lastWeek = (values: number[]) => sum(values.slice(-7));

async function Tiles({
  user,
  tiles: ids,
  can,
  series,
  analytics,
  range,
}: {
  user: AuthUser;
  tiles: TileId[];
  can: DashboardCan;
  series: Promise<ActivitySeries | null>;
  analytics: Promise<SiteAnalytics | null>;
  range: AnalyticsRange;
}) {
  const wants = (id: TileId) => ids.includes(id);
  const [days, inquiries, content, factors, site] = await Promise.all([
    series.then((result) => result?.days ?? []),
    wants("inquiries") ? getNewInquiriesCount() : Promise.resolve(0),
    wants("unpublished") ? getContentCounts() : Promise.resolve({ drafts: 0, unpublished: 0 }),
    wants("security") ? authAdapter.findMfaFactors(user.id).catch(() => null) : Promise.resolve(null),
    wants("visitors") && can.analytics ? analytics : Promise.resolve(null),
  ]);
  const column = (key: SeriesKey) => days.map((day) => day[key]);
  const strongCount = factors ? (factors.totpEnabledAt ? 1 : 0) + factors.passkeys : 0;

  const build: Record<TileId, () => ReactNode> = {
    visitors: () => (
      <StatTile
        href="#analytics"
        label="Visitors"
        value={site?.totals.visitors ?? 0}
        icon={<Icon name="users" className="size-4" />}
        caption={site ? `counted once a day, last ${range} days` : "analytics not available"}
        trend={site?.days.map((day) => day.visitors)}
        delta={site ? { value: site.totals.visitors - site.totals.previousVisitors, period: `vs previous ${range} days` } : undefined}
      />
    ),
    inquiries: () => {
      const trend = column("inquiries");
      return (
        <StatTile
          href="/admin/leads?status=NEW"
          label="New inquiries"
          value={inquiries}
          icon={<Icon name="mail-filled" className="size-4" />}
          caption="waiting for a reply"
          trend={trend}
          delta={{ value: lastWeek(trend), period: "this week" }}
          tone="attention"
        />
      );
    },
    unpublished: () => (
      <StatTile
        href="/admin/blog?status=DRAFT"
        label="Not yet public"
        value={content.unpublished}
        icon={<Icon name="pen" className="size-4" />}
        caption={`includes ${content.drafts} draft ${content.drafts === 1 ? "block" : "blocks"}`}
      />
    ),
    published: () => {
      const trend = column("posts");
      return (
        <StatTile
          href="/admin/blog?status=PUBLISHED"
          label="Posts published"
          value={sum(trend)}
          icon={<Icon name="file-description" className="size-4" />}
          caption="in the last 30 days"
          trend={trend}
        />
      );
    },
    activity: () => {
      const trend = column("activity");
      return (
        <StatTile
          href="/admin/audit"
          label="Admin activity"
          value={lastWeek(trend)}
          icon={<Icon name="chart-line" className="size-4" />}
          caption="changes in the last 7 days"
          trend={trend}
        />
      );
    },
    security: () => (
      <StatTile
        href="/admin/account#security"
        label="Your sign-in"
        value={strongCount}
        icon={strongCount > 0 ? <Icon name="shield-check" className="size-4" /> : <Icon name="lock" className="size-4" />}
        caption={strongCount > 0 ? "strong factors (app or passkeys)" : "no app or passkey yet"}
      />
    ),
  };

  return (
    <RevealGroup className="grid gap-4 s640:grid-cols-2 xl:grid-cols-4">
      {ids.map((id) => (
        <RevealItem key={id}>{build[id]()}</RevealItem>
      ))}
    </RevealGroup>
  );
}

function QuickActions({ user }: { user: AuthUser }) {
  const actions = quickActionsFor(user);
  if (actions.length === 0) return null;
  return (
    <Panel title="Quick actions">
      <ul className="grid gap-2 s640:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {actions.map((action) => (
          <li key={action.href}>
            <Link
              href={action.href}
              prefetch={false}
              className="flex h-full items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors hover:border-foreground/20 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Icon name={action.icon} className="size-4" />
              </span>
              {action.label}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ─── analytics ──────────────────────────────────────────────────────────────

const TRAFFIC_SERIES = [
  { key: "visitors", label: "Visitors", color: "hsl(var(--chart-1))" },
  { key: "views", label: "Page views", color: "hsl(var(--chart-2))" },
];

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

function countryLabel(code: string): { label: string; flag: string } {
  if (!/^[A-Z]{2}$/.test(code) || code === "XX") return { label: "Unknown", flag: "🌐" };
  let label = code;
  try {
    label = regionNames.of(code) ?? code;
  } catch {
    // An unassigned code keeps its letters.
  }
  return { label, flag: String.fromCodePoint(...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65)) };
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

function change(current: number, previous: number): { text: string; up: boolean | null } {
  if (previous === 0) return { text: current > 0 ? "new" : "no change", up: current > 0 ? true : null };
  const percent = Math.round(((current - previous) / previous) * 100);
  return { text: `${percent > 0 ? "+" : ""}${percent}%`, up: percent === 0 ? null : percent > 0 };
}

function RangeTabs({ range }: { range: AnalyticsRange }) {
  return (
    <nav aria-label="Date range" className="flex rounded-lg border border-border p-0.5 text-xs">
      {ANALYTICS_RANGES.map((value) => (
        <Link
          key={value}
          href={`?range=${value}#analytics`}
          scroll={false}
          prefetch={false}
          aria-current={value === range ? "page" : undefined}
          className={`rounded-md px-2.5 py-1 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            value === range ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {value}d
        </Link>
      ))}
    </nav>
  );
}

function Kpi({ label, value, hint, delta }: { label: string; value: string; hint: string; delta?: { text: string; up: boolean | null } }) {
  return (
    <div className="rounded-lg border border-border px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
        {delta ? (
          <span
            className={`text-xs font-medium tabular-nums ${
              delta.up === null ? "text-muted-foreground" : delta.up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
            }`}
          >
            {delta.text}
          </span>
        ) : null}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function rankedItems(list: Ranked[], label: (item: Ranked) => ReactNode = (item) => item.label, title: (item: Ranked) => string = (item) => item.label) {
  return list.map((item) => ({ key: item.label, label: label(item), value: item.value, title: title(item) }));
}

function CountryName({ code }: { code: string }) {
  const country = countryLabel(code);
  return (
    <>
      <span aria-hidden="true" className="mr-1.5">
        {country.flag}
      </span>
      {country.label}
    </>
  );
}

async function AnalyticsPanel({ analytics, range }: { analytics: Promise<SiteAnalytics | null>; range: AnalyticsRange }) {
  const site = await analytics;
  const title = "Site traffic";
  const tabs = <RangeTabs range={range} />;
  if (!site) {
    return (
      <Panel id="analytics" title={title} aside={tabs}>
        <p className="text-sm text-muted-foreground">
          Analytics is unavailable: it records to Redis, which is not configured or did not answer. Set UPSTASH_REDIS_REST_URL and
          UPSTASH_REDIS_REST_TOKEN to start counting visits.
        </p>
      </Panel>
    );
  }
  const { totals } = site;
  const perVisitor = totals.visitors > 0 ? totals.views / totals.visitors : 0;
  const period = `vs previous ${range} days`;
  const generated = new Date(site.generatedAt);

  return (
    <Panel
      id="analytics"
      title={title}
      aside={
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground s640:inline" title={formatDateTime(generated)}>
            Updated {relativeTime(generated, clock())}
          </span>
          {tabs}
        </div>
      }
    >
      <div className="grid gap-3 s640:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Visitors" value={compactFormat.format(totals.visitors)} hint={period} delta={change(totals.visitors, totals.previousVisitors)} />
        <Kpi label="Page views" value={compactFormat.format(totals.views)} hint={period} delta={change(totals.views, totals.previousViews)} />
        <Kpi label="Views per visitor" value={perVisitor.toFixed(1)} hint={`last ${range} days`} />
        <Kpi label="On the site now" value={numberFormat.format(site.live)} hint="seen in the last 5 minutes" />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Visitors are counted once a day: the anonymous visitor id changes daily and no cookie is set, so someone who comes back on
        three days counts three times. Bots, automated browsers and visitors who ask not to be tracked are not counted.
      </p>

      {totals.views === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No visits recorded in this range yet. A view shows up here a minute after someone opens a public page.
        </p>
      ) : (
        <>
          <div className="mt-6">
            <TrendChartLazy days={site.days} series={TRAFFIC_SERIES} />
            <table className="sr-only">
              <caption>Daily visitors and page views for the last {range} days</caption>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Visitors</th>
                  <th scope="col">Page views</th>
                </tr>
              </thead>
              <tbody>
                {site.days.map((day) => (
                  <tr key={day.day}>
                    <th scope="row">{day.day}</th>
                    <td>{day.visitors}</td>
                    <td>{day.views}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid gap-6 s768:grid-cols-2 xl:grid-cols-4">
            <Breakdown title="Top pages">
              <BarList
                items={rankedItems(site.pages, (item) => (
                  <a href={item.label} target="_blank" rel="noopener" className="underline-offset-4 hover:underline">
                    {item.label}
                  </a>
                ))}
                empty="No pages yet."
              />
            </Breakdown>
            <Breakdown title="Referrers">
              <BarList items={rankedItems(site.referrers)} empty="No referrers yet: visits came direct, or from apps that hide where they came from." />
            </Breakdown>
            <Breakdown title="Countries">
              <BarList
                items={rankedItems(
                  site.countries,
                  (item) => <CountryName code={item.label} />,
                  (item) => countryLabel(item.label).label
                )}
                empty="No countries yet."
              />
            </Breakdown>
            <Breakdown title="Devices">
              <BarList items={rankedItems(site.devices, (item) => capitalize(item.label))} empty="No devices yet." />
              <h4 className="mb-2 mt-4 text-xs font-medium text-muted-foreground">Browsers</h4>
              <BarList items={rankedItems(site.browsers.slice(0, 4))} empty="No browsers yet." />
              <h4 className="mb-2 mt-4 text-xs font-medium text-muted-foreground">Systems</h4>
              <BarList items={rankedItems(site.systems.slice(0, 4))} empty="No systems yet." />
            </Breakdown>
          </div>
        </>
      )}
      <p className="mt-6 text-xs text-muted-foreground">
        First-party and cookie-free: no IP address or browser string is stored, and browsers that send Do Not Track or Global Privacy Control are not
        counted.
      </p>
    </Panel>
  );
}

function Breakdown({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

// ─── content and audience ───────────────────────────────────────────────────

const SERIES_META: Record<SeriesKey, { label: string; color: string }> = {
  inquiries: { label: "Inquiries", color: "hsl(var(--chart-1))" },
  posts: { label: "Posts published", color: "hsl(var(--chart-2))" },
  activity: { label: "Admin activity", color: "hsl(var(--chart-4))" },
};

async function TrendPanel({ series, keys }: { series: Promise<ActivitySeries | null>; keys: SeriesKey[] }) {
  const result = await series;
  if (!result) {
    return (
      <Panel title="Last 30 days">
        <p className="text-sm text-muted-foreground">The trend is unavailable: the database did not answer.</p>
      </Panel>
    );
  }
  // Only the series this viewer may see reach the browser.
  const days = result.days.map((day) => ({
    day: day.day,
    inquiries: keys.includes("inquiries") ? day.inquiries : undefined,
    posts: keys.includes("posts") ? day.posts : undefined,
    activity: keys.includes("activity") ? day.activity : undefined,
  }));
  const generated = new Date(result.generatedAt);
  return (
    <Panel
      title="Last 30 days"
      aside={
        <span className="text-xs text-muted-foreground" title={formatDateTime(generated)}>
          Updated {relativeTime(generated, clock())}
        </span>
      }
    >
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground" aria-hidden="true">
        {keys.map((key) => (
          <li key={key} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: SERIES_META[key].color }} />
            {SERIES_META[key].label}
            <span className="font-medium tabular-nums text-foreground">{sum(result.days.map((day) => day[key]))}</span>
          </li>
        ))}
      </ul>
      <TrendChartLazy days={days} series={keys.map((key) => ({ key, ...SERIES_META[key] }))} />
      <table className="sr-only">
        <caption>Daily counts for the last 30 days</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {keys.map((key) => (
              <th key={key} scope="col">
                {SERIES_META[key].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.days.map((day) => (
            <tr key={day.day}>
              <th scope="row">{day.day}</th>
              {keys.map((key) => (
                <td key={key}>{day[key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

const STATUS_STYLE: Record<DashboardPostStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  SCHEDULED: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  PUBLISHED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  ARCHIVED: "bg-muted text-muted-foreground",
};

const POST_STATUSES: DashboardPostStatus[] = ["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"];

async function PipelinePanel({ now }: { now: number }) {
  const pipeline = await getPostPipeline(5);
  const aside = (
    <Link href="/admin/blog" className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
      All posts
    </Link>
  );
  if (!pipeline) {
    return (
      <Panel title="Blog pipeline" aside={aside}>
        <p className="text-sm text-muted-foreground">Posts are unavailable: the database did not answer.</p>
      </Panel>
    );
  }
  return (
    <Panel title="Blog pipeline" aside={aside}>
      <ul className="mb-4 grid grid-cols-4 gap-2 text-center">
        {POST_STATUSES.map((status) => (
          <li key={status}>
            <Link
              href={`/admin/blog?status=${status}`}
              prefetch={false}
              className="block rounded-lg border border-border px-2 py-2 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="block text-[11px] font-medium text-muted-foreground">{capitalize(status.toLowerCase())}</span>
              <span className="block text-lg font-semibold tabular-nums">{numberFormat.format(pipeline.counts[status])}</span>
            </Link>
          </li>
        ))}
      </ul>
      {pipeline.upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing in progress: every post is out.</p>
      ) : (
        <ol className="divide-y divide-border">
          {pipeline.upcoming.map((post) => {
            const scheduled = post.status === "SCHEDULED" && post.publishAt !== null;
            const when = scheduled && post.publishAt ? post.publishAt : post.updatedAt;
            return (
              <li key={post.id} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                <Link href={`/admin/blog/${post.id}`} prefetch={false} className="min-w-0 truncate font-medium underline-offset-4 hover:underline">
                  {post.title || "Untitled"}
                </Link>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[post.status]}`}>{scheduled ? "Scheduled" : "Draft"}</span>
                  <time dateTime={when.toISOString()} title={formatDateTime(when)} className="text-xs tabular-nums text-muted-foreground">
                    {scheduled ? formatDateTime(when) : `edited ${relativeTime(when, now)}`}
                  </time>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

async function InboxPanel({ can, now }: { can: DashboardCan; now: number }) {
  const [inquiries, chats] = await Promise.all([getNewInquiries(5), can.chat ? getRecentChatCount(now) : Promise.resolve(null)]);
  return (
    <Panel
      title="Inbox"
      aside={
        <Link href="/admin/leads?status=NEW" className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          All leads
        </Link>
      }
    >
      {inquiries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No new inquiries. You are all caught up.</p>
      ) : (
        <ol className="divide-y divide-border">
          {inquiries.map((inquiry) => (
            <li key={inquiry.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
              <Link href={`/admin/leads/${inquiry.id}`} prefetch={false} className="min-w-0 underline-offset-4 hover:underline">
                <span className="block truncate font-medium">{inquiry.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{inquiry.topic ?? "General inquiry"}</span>
              </Link>
              <time
                dateTime={inquiry.createdAt.toISOString()}
                title={formatDateTime(inquiry.createdAt)}
                className="shrink-0 text-xs tabular-nums text-muted-foreground"
              >
                {relativeTime(inquiry.createdAt, now)}
              </time>
            </li>
          ))}
        </ol>
      )}
      {chats !== null ? (
        <Link
          href="/admin/chatbot"
          prefetch={false}
          className="mt-4 flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <Icon name="message-circle" className="size-4" />
            Chatbot conversations, last 7 days
          </span>
          <span className="font-semibold tabular-nums">{numberFormat.format(chats)}</span>
        </Link>
      ) : null}
    </Panel>
  );
}

// ─── system ─────────────────────────────────────────────────────────────────

async function SecurityPanel({ can, now }: { can: DashboardCan; now: number }) {
  const counts = await getSecurityCounts(now);
  if (!counts) {
    return (
      <Panel title="Access">
        <p className="text-sm text-muted-foreground">Session data is unavailable: the database did not answer.</p>
      </Panel>
    );
  }
  const rows = [
    { label: "Active sessions", value: counts.activeSessions, href: "/admin/sessions", warn: false },
    { label: "People signed in", value: counts.activeUsers, href: "/admin/sessions", warn: false },
    {
      label: "Failed sign-ins, 7 days",
      value: counts.failedSignIns,
      href: can.audit ? "/admin/audit?action=auth.login.failure" : null,
      warn: counts.failedSignIns >= 10,
    },
  ];
  return (
    <Panel title="Access">
      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const body = (
            <>
              <span className="text-muted-foreground">{row.label}</span>
              <span className={`font-semibold tabular-nums ${row.warn ? "text-red-600 dark:text-red-400" : ""}`}>{numberFormat.format(row.value)}</span>
            </>
          );
          return (
            <li key={row.label} className="py-2.5 text-sm first:pt-0 last:pb-0">
              {row.href ? (
                <Link href={row.href} prefetch={false} className="flex items-center justify-between gap-3 underline-offset-4 hover:underline">
                  {body}
                </Link>
              ) : (
                <div className="flex items-center justify-between gap-3">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

const PROBE_TEXT: Record<Probe["state"], string> = { up: "Online", down: "Not answering", off: "In-memory" };
const PROBE_DOT: Record<Probe["state"], string> = { up: "bg-emerald-500", down: "bg-red-500", off: "bg-amber-500" };

async function HealthPanel() {
  const [health, email] = await Promise.all([getSystemHealth(), getEmailHealth()]);
  const rows: { name: string; detail: string; state: Probe["state"]; ms: number | null; text?: string }[] = [
    { name: "Database", detail: "primary storage", ...health.database },
    { name: "Redis", detail: "cache, limits, analytics", ...health.redis },
    { name: "Email", detail: "transactional mail", state: email?.canSend ? "up" : "down", ms: null, text: email?.canSend ? "Ready" : "Not configured" },
  ];
  return (
    <Panel title="System" aside={<span className="text-xs text-muted-foreground">Checked just now</span>}>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.name} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-sm font-medium">{row.name}</p>
              <p className="truncate text-xs text-muted-foreground">{row.detail}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-sm">
              {row.ms !== null ? <span className="text-xs tabular-nums text-muted-foreground">{row.ms} ms</span> : null}
              <span className={`size-2 rounded-full ${PROBE_DOT[row.state]}`} aria-hidden="true" />
              <span>{row.text ?? PROBE_TEXT[row.state]}</span>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

async function ActivityPanel({ user }: { user: AuthUser }) {
  const activity = await getRecentActivity(user, 8);
  const now = clock();
  return (
    <Panel
      title="Recent activity"
      aside={
        <Link href="/admin/audit" className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Audit log
        </Link>
      }
    >
      {activity.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <ol className="divide-y divide-border">
          {activity.map((entry) => (
            <li key={entry.id} className="flex items-baseline justify-between gap-4 py-2.5 text-sm first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate font-medium">{entry.action}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {entry.actorEmail ?? "System"}
                  {entry.entityType ? ` · ${entry.entityType}` : ""}
                </p>
              </div>
              <time
                dateTime={entry.createdAt.toISOString()}
                title={formatDateTime(entry.createdAt)}
                className="shrink-0 text-xs tabular-nums text-muted-foreground"
              >
                {relativeTime(entry.createdAt, now)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

// ─── building blocks ────────────────────────────────────────────────────────

function Panel({ id, title, aside, children }: { id?: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-label={title} className="h-full scroll-mt-20 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function TilesSkeleton({ count }: { count: number }) {
  return (
    <div className="grid gap-4 s640:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="h-[132px] animate-pulse rounded-xl border border-border bg-muted/40 motion-reduce:animate-none" />
      ))}
    </div>
  );
}

function PanelSkeleton({ height }: { height: string }) {
  return <div className={`${height} animate-pulse rounded-xl border border-border bg-muted/40 motion-reduce:animate-none`} aria-hidden="true" />;
}
