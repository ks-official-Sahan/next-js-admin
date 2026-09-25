import type { Metadata } from "next";
import Link from "next/link";

import {
  ForceLogoutEveryoneForm,
  ForceLogoutUserForm,
  RevokeSessionForm,
} from "@/components/admin/sessions/SessionForms";
import EmptyState from "@/components/admin/ui/EmptyState";
import { badgeClass, cardClass, tableClass, tdClass, thClass } from "@/components/admin/ui/styles";
import { formatDateTime, relativeTime } from "@/lib/admin/format";
import { hasPermission, requirePermission } from "@/lib/auth/dal";
import type { RoleName } from "@/lib/auth/permissions";
import { canManage } from "@/lib/auth/rbac-rules";
import { listSessions } from "@/lib/auth/session-store";
import { db } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Sessions" };

// Read outside the component: a server render is one request, and this is its clock.
const clock = () => Date.now();

export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ ended?: string }> }) {
  const actor = await requirePermission("viewSessions");
  const { ended } = await searchParams;
  const includeEnded = ended === "1";

  const sessions = await listSessions({ includeEnded, limit: 200 });
  // Roles of the people shown, to decide which buttons this actor may use.
  const roles = new Map<string, RoleName>(
    (
      await db.user.findMany({
        where: { id: { in: [...new Set(sessions.map((session) => session.userId))] } },
        select: { id: true, role: true },
      })
    ).map((user) => [user.id, user.role as RoleName])
  );
  const now = clock();
  const isLive = (session: (typeof sessions)[number]) => !session.revokedAt && session.expiresAt.getTime() > now;

  const mayRevoke = hasPermission(actor, "revokeSessions");
  const mayForce = hasPermission(actor, "forceLogout");
  // One row per signed-in person this actor may sign out.
  const reachable = [...new Map(sessions.filter(isLive).map((session) => [session.userId, session])).values()].filter(
    (session) => {
      const role = roles.get(session.userId);
      return session.userId !== actor.id && role !== undefined && canManage(actor, { id: session.userId, role });
    }
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every signed-in browser. An ended session is signed out on its next request, and an idle tab within 30
          seconds.
        </p>
      </div>

      <section aria-labelledby="sessions-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="sessions-heading" className="text-base font-medium">
            {includeEnded ? "Active and recently ended" : "Active"} ({sessions.length})
          </h2>
          <Link
            href={includeEnded ? "/admin/sessions" : "/admin/sessions?ended=1"}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {includeEnded ? "Show active only" : "Include the last 7 days of ended sessions"}
          </Link>
        </div>

        {sessions.length === 0 ? (
          <EmptyState title="No sessions" description="Nobody is signed in." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className={tableClass}>
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th scope="col" className={thClass}>User</th>
                  <th scope="col" className={thClass}>Device</th>
                  <th scope="col" className={thClass}>Last active</th>
                  <th scope="col" className={thClass}>Status</th>
                  <th scope="col" className={thClass}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sessions.map((session) => {
                  const live = isLive(session);
                  const role = roles.get(session.userId);
                  const current = session.id === actor.sid;
                  const reach =
                    session.userId === actor.id || (role ? canManage(actor, { id: session.userId, role }) : false);
                  const allowed = live && !current && mayRevoke && reach;
                  return (
                    <tr key={session.id}>
                      <td className={tdClass}>
                        <div className="font-medium">{session.userName ?? session.userEmail}</div>
                        {session.userName ? (
                          <div className="text-xs text-muted-foreground">{session.userEmail}</div>
                        ) : null}
                      </td>
                      <td className={tdClass}>
                        <div>{[session.browser, session.os].filter(Boolean).join(" on ") || "Unknown device"}</div>
                        <div className="text-xs text-muted-foreground">{session.ip ?? "Unknown IP"}</div>
                      </td>
                      <td className={tdClass} title={formatDateTime(session.lastSeenAt)}>
                        {relativeTime(session.lastSeenAt)}
                        <div className="text-xs text-muted-foreground">Started {relativeTime(session.createdAt)}</div>
                      </td>
                      <td className={tdClass}>
                        <div className="flex flex-wrap gap-1.5">
                          <span className={badgeClass}>{live ? "Active" : session.revokedAt ? "Ended" : "Expired"}</span>
                          {current ? <span className={badgeClass}>This device</span> : null}
                          {session.mfaVerified ? <span className={badgeClass}>Two-factor</span> : null}
                        </div>
                        {session.revokedAt && session.revokeReason ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {session.revokeReason.replaceAll("_", " ")}
                          </div>
                        ) : null}
                      </td>
                      <td className={`${tdClass} text-right`}>
                        {allowed ? <RevokeSessionForm sessionId={session.id} /> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {mayForce ? (
        <section className={cardClass} aria-labelledby="force-heading">
          <h2 id="force-heading" className="text-base font-medium">
            Force logout
          </h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            Ends every session of one person at once, for example when a device is lost.
          </p>
          {reachable.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody else you manage is signed in.</p>
          ) : (
            <ul className="divide-y divide-border">
              {reachable.map((session) => (
                <li
                  key={session.userId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span className="text-sm">{session.userName ?? session.userEmail}</span>
                  <ForceLogoutUserForm userId={session.userId} email={session.userEmail} />
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
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            For an incident, for example a leaked password. Everyone signs in again.
          </p>
          <ForceLogoutEveryoneForm />
        </section>
      ) : null}
    </div>
  );
}
