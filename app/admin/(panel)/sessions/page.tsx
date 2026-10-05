import type { Metadata } from "next";
import Link from "next/link";

import { ForceLogoutEveryoneForm, ForceLogoutUserForm } from "@/components/admin/sessions/SessionForms";
import SessionsTable, { type SessionRowView } from "@/components/admin/sessions/SessionsTable";
import SessionsToolbar from "@/components/admin/sessions/SessionsToolbar";
import EmptyState from "@/components/admin/ui/EmptyState";
import { cardClass } from "@/components/admin/ui/styles";
import { formatDateTime, relativeTime } from "@/lib/admin/format";
import { hasPermission, requirePermission } from "@/lib/auth/dal";
import { canManage } from "@/lib/auth/rbac-rules";
import { repos } from "@/lib/data";
import { parseSessionView, SESSION_PAGE_SIZE, sessionViewSearch, type SearchParams } from "@/lib/sessions/query";

export const metadata: Metadata = { title: "Sessions" };

const SESSIONS_PATH = "/admin/sessions";

// Read outside the component: a server render is one request, and this is its clock.
const clock = () => Date.now();

// Sessions are searched, filtered and keyset-paged in the database from the
// URL (lib/sessions/query.ts): newest activity first, `after` continues from
// the last row shown, so a deep page costs the same as the first.
export default async function SessionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePermission("viewSessions");
  const view = parseSessionView(await searchParams);
  const nowMs = clock();
  const now = new Date(nowMs);

  const mayRevoke = hasPermission(actor, "revokeSessions");
  const mayForce = hasPermission(actor, "forceLogout");

  const [page, person, signedIn] = await Promise.all([
    repos.sessions.search({ q: view.q, userId: view.user, status: view.status, after: view.after, limit: SESSION_PAGE_SIZE, now }),
    view.user ? repos.users.findRef(view.user) : Promise.resolve(null),
    mayForce ? repos.users.listWithLiveSessions(now) : Promise.resolve([]),
  ]);

  const rows: SessionRowView[] = page.items.map((session) => {
    const live = !session.revokedAt && session.expiresAt.getTime() > nowMs;
    const current = session.id === actor.sid;
    // Your own other sessions are always yours to end. Anyone else's follows the hierarchy.
    const reach = session.userId === actor.id || canManage(actor, { id: session.userId, role: session.userRole });
    return {
      id: session.id,
      userName: session.userName,
      userEmail: session.userEmail,
      device: [session.browser, session.os].filter(Boolean).join(" on ") || "Unknown device",
      ip: session.ip ?? "Unknown IP",
      lastSeen: { label: relativeTime(session.lastSeenAt, nowMs), title: formatDateTime(session.lastSeenAt) },
      started: relativeTime(session.createdAt, nowMs),
      status: live ? "Active" : session.revokedAt ? "Ended" : "Expired",
      current,
      mfaVerified: session.mfaVerified,
      revokeReason: session.revokedAt && session.revokeReason ? session.revokeReason.replaceAll("_", " ") : null,
      canEnd: live && !current && reach,
    };
  });

  // One entry per signed-in person this actor may sign out.
  const reachable = signedIn.filter((person) => person.id !== actor.id && canManage(actor, { id: person.id, role: person.role }));
  const narrowed = Boolean(view.q || view.user || view.status !== "active");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every signed-in browser. An ended session is signed out on its next request, and an idle tab within 30 seconds.
        </p>
      </div>

      <section aria-labelledby="sessions-heading" className="space-y-3">
        <h2 id="sessions-heading" className="text-base font-medium">
          Browsers and devices
        </h2>
        <SessionsToolbar view={view} userLabel={person ? (person.name ?? person.email) : null} shown={rows.length} />

        {rows.length === 0 ? (
          <EmptyState
            title={narrowed ? "No sessions match" : "No sessions"}
            description={narrowed ? "Try another search or status." : "Nobody is signed in."}
            action={
              narrowed ? (
                <Link href={SESSIONS_PATH} className="text-sm font-medium underline underline-offset-4">
                  Show active sessions
                </Link>
              ) : undefined
            }
          />
        ) : (
          <SessionsTable rows={rows} viewKey={sessionViewSearch(view)} mayRevoke={mayRevoke} />
        )}

        {page.next || view.after ? (
          <nav aria-label="Pagination" className="flex flex-wrap items-center justify-end gap-2 text-sm">
            {view.after ? (
              <Link
                href={`${SESSIONS_PATH}${sessionViewSearch(view, { after: undefined })}`}
                scroll={false}
                className="rounded-md border border-input px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Back to newest
              </Link>
            ) : null}
            {page.next ? (
              <Link
                href={`${SESSIONS_PATH}${sessionViewSearch(view, { after: page.next })}`}
                scroll={false}
                className="rounded-md border border-input px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Older sessions
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>

      {mayForce ? (
        <section className={cardClass} aria-labelledby="force-heading">
          <h2 id="force-heading" className="text-base font-medium">
            Force logout
          </h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">Ends every session of one person at once, for example when a device is lost.</p>
          {reachable.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody else you manage is signed in.</p>
          ) : (
            <ul className="divide-y divide-border">
              {reachable.map((person) => (
                <li key={person.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="text-sm">{person.name ?? person.email}</span>
                  <ForceLogoutUserForm userId={person.id} email={person.email} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {mayForce && actor.role === "DEVELOPER" ? (
        <section className={cardClass} aria-labelledby="everyone-heading">
          <h2 id="everyone-heading" className="text-base font-medium">
            Sign everyone out
          </h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">For an incident, for example a leaked password. Everyone signs in again.</p>
          <ForceLogoutEveryoneForm />
        </section>
      ) : null}
    </div>
  );
}
