import type { Metadata } from "next";

import {
  EmailChangeForm,
  EndOtherSessionsButton,
  EndSessionButton,
  MfaFlow,
  PasswordForm,
  ProfileForm,
} from "@/components/admin/account/AccountForms";
import { badgeClass, cardClass } from "@/components/admin/ui/styles";
import { formatDateTime, relativeTime } from "@/lib/admin/format";
import { ROLE_LABEL } from "@/lib/admin/roles";
import { requireUser } from "@/lib/auth/dal";
import { listSessions } from "@/lib/auth/session-store";
import { db } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  // A user who must change their password lands here, so this page lets them in.
  const user = await requireUser({ allowPasswordChange: true });

  const [profile, sessions] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: { name: true, bio: true, mfaEnabled: true, lastLoginAt: true },
    }),
    listSessions({ userId: user.id, limit: 50 }),
  ]);
  const mfaEnabled = profile?.mfaEnabled ?? false;
  const others = sessions.filter((session) => session.id !== user.sid);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {user.email} <span className={`${badgeClass} ml-1`}>{ROLE_LABEL[user.role]}</span>
        </p>
      </div>

      {user.mustChangePassword ? (
        <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
          <p className="font-medium">Choose your own password to continue.</p>
          <p className="mt-1 text-muted-foreground">
            The password you signed in with was set by someone else. Until you change it, this is the only page you
            can open.
          </p>
        </div>
      ) : null}

      <section id="password" className={cardClass} aria-labelledby="password-heading">
        <h2 id="password-heading" className="text-base font-medium">
          Password
        </h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          Changing it signs out every other session. This one stays signed in.
        </p>
        <PasswordForm email={user.email} forced={user.mustChangePassword} />
      </section>

      <section id="email" className={cardClass} aria-labelledby="email-heading">
        <h2 id="email-heading" className="text-base font-medium">
          Email
        </h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          Changing it confirms the new address first, then signs out every session.
        </p>
        <EmailChangeForm email={user.email} />
      </section>

      <section className={cardClass} aria-labelledby="profile-heading">
        <h2 id="profile-heading" className="mb-4 text-base font-medium">
          Profile
        </h2>
        <ProfileForm name={profile?.name ?? ""} bio={profile?.bio ?? ""} />
      </section>

      <section className={cardClass} aria-labelledby="mfa-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="mfa-heading" className="text-base font-medium">
            Two-factor sign-in
          </h2>
          <span className={badgeClass}>{mfaEnabled ? "On" : "Off"}</span>
        </div>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          {mfaEnabled
            ? "Signing in asks for a code emailed to you, as well as your password."
            : "Add a code emailed to you to the password when signing in."}
        </p>
        <MfaFlow key={mfaEnabled ? "on" : "off"} enabled={mfaEnabled} email={user.email} />
      </section>

      <section className={cardClass} aria-labelledby="sessions-heading">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="sessions-heading" className="text-base font-medium">
            Your sessions
          </h2>
          {others.length > 0 ? <EndOtherSessionsButton /> : null}
        </div>
        <ul className="divide-y divide-border">
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {[session.browser, session.os].filter(Boolean).join(" on ") || "Unknown device"}
                  {session.id === user.sid ? <span className={`${badgeClass} ml-2`}>This device</span> : null}
                </p>
                <p className="text-xs text-muted-foreground" title={formatDateTime(session.lastSeenAt)}>
                  {session.ip ?? "Unknown IP"}, active {relativeTime(session.lastSeenAt)}
                </p>
              </div>
              {session.id === user.sid ? null : <EndSessionButton sessionId={session.id} />}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">Last sign-in: {formatDateTime(profile?.lastLoginAt)}</p>
      </section>
    </div>
  );
}
