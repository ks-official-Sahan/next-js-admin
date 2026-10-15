import type { Metadata } from "next";

import {
  EmailChangeForm,
  EndOtherSessionsButton,
  EndSessionButton,
  MfaFlow,
  PasswordForm,
  ProfileForm,
} from "@/components/admin/account/AccountForms";
import DeveloperMaskCard from "@/components/admin/account/DeveloperMaskCard";
import SecurityFactors from "@/components/admin/account/SecurityFactors";
import SignInLinkCard from "@/components/admin/account/SignInLinkCard";
import { badgeClass, cardClass } from "@/components/admin/ui/styles";
import { formatDateTime, relativeTime } from "@/lib/admin/format";
import { ROLE_LABEL } from "@/lib/admin/roles";
import { requireUser } from "@/lib/auth/dal";
import { maskingEnabled } from "@/lib/auth/mask";
import { PASSKEY_RP_IDS, requestRelyingParty } from "@/lib/auth/passkeys";
import { factorsOf } from "@/lib/auth/mfa";
import { MASK_ROLE, SUPER_ROLE } from "@/lib/auth/permissions";
import { listSessions } from "@/lib/auth/session-store";
import { authAdapter, repos } from "@/lib/data";
import { getSetting } from "@/lib/settings/service";

export const metadata: Metadata = { title: "Account" };

// Read outside the component: a server render is one request, and this is its clock.
const clock = () => Date.now();

export default async function AccountPage() {
  // A user who must change their password, or set up a strong factor, lands here, so this page lets them in.
  const user = await requireUser({ allowPasswordChange: true, allowMfaSetup: true });

  // Developer masking shows only to developers, and only while it is turned on (lib/auth/mask.ts).
  const maskControls = user.role === SUPER_ROLE && maskingEnabled();
  const [profile, sessions, maskSetting, factors, passkeyRows] = await Promise.all([
    repos.users.findProfile(user.id),
    listSessions({ userId: user.id, limit: 50 }),
    maskControls ? getSetting("security.mask") : Promise.resolve(null),
    factorsOf(user.id),
    authAdapter.listPasskeys(user.id),
  ]);
  const now = clock();
  const passkeyViews = passkeyRows.map((passkey) => ({
    id: passkey.id,
    name: passkey.name,
    added: formatDateTime(passkey.createdAt),
    lastUsed: passkey.lastUsedAt ? relativeTime(passkey.lastUsedAt, now) : null,
  }));
  const masked = maskControls && Boolean(profile?.masked || maskSetting?.global);
  const mfaEnabled = profile?.mfaEnabled ?? false;
  const others = sessions.filter((session) => session.id !== user.sid);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {user.email} <span className={`${badgeClass} ml-1`}>{ROLE_LABEL[user.role]}</span>
          {masked ? <span className={`${badgeClass} ml-1`}>Masked as {ROLE_LABEL[MASK_ROLE]}</span> : null}
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

      {user.mfaSetupRequired && !user.mustChangePassword ? (
        <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
          <p className="font-medium">Set up an authenticator app or a passkey to continue.</p>
          <p className="mt-1 text-muted-foreground">
            Your role can change everything on this site, so it needs a stronger second factor than an emailed code.
            Until you add one below, this is the only page you can open.
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

      <section id="security" className={cardClass} aria-labelledby="security-heading">
        <h2 id="security-heading" className="text-base font-medium">
          Authenticator app, passkeys and recovery codes
        </h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          Stronger than an emailed code. With one of these set up, signing in asks for it after your password.
        </p>
        <SecurityFactors totp={factors?.totp ?? false} passkeys={passkeyViews} recoveryCodesLeft={factors?.recoveryCodesLeft ?? 0} rpId={await requestRelyingParty()} rpIds={PASSKEY_RP_IDS} />
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

      {maskControls ? (
        <section className={cardClass} aria-labelledby="mask-heading">
          <h2 id="mask-heading" className="text-base font-medium">
            Developer masking
          </h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            Everyone but developers sees a masked developer as a super admin, and the developer role, its audit rows and
            its settings stay hidden from them. What you can do never changes. Only developers see this card and who is
            masked. Every change is confirmed with a code emailed to you, and audited.
          </p>
          <DeveloperMaskCard
            key={`${profile?.masked}-${maskSetting?.global}`}
            masked={profile?.masked ?? false}
            global={maskSetting?.global ?? false}
            email={user.email}
          />
        </section>
      ) : null}

      <SignInLinkCard audience="self" />
    </div>
  );
}
