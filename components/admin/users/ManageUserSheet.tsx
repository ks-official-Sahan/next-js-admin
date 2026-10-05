"use client";

import Link from "next/link";
import { ArrowRight, KeyRound, LogOut, ShieldCheck, UserCog } from "lucide-react";
import type { ReactNode } from "react";

import ActionForm, { ConfirmSubmitButton, Field, SubmitButton } from "@/components/admin/ui/ActionForm";
import Sheet from "@/components/admin/ui/Sheet";
import { badgeClass } from "@/components/admin/ui/styles";
import { changeRole, deleteUser, sendReset, setDisabled } from "@/lib/actions/users";
import { forceLogoutUser } from "@/lib/actions/sessions";
import { ROLE_LABEL } from "@/lib/admin/roles";
import type { RoleName } from "@/lib/auth/permissions";

import { RoleSelect } from "./UserForms";

// Everything one person's account offers, in a sheet instead of a cramped
// inline panel: who they are and how they sign in at the top, then one
// section per kind of change, with the irreversible one set apart at the
// bottom. Each section is its own form with its own result message, so a
// failed reset never hides behind a role change. The server re-checks every
// rule; these capabilities only decide what to show.

export interface UserRowView {
  id: string;
  email: string;
  name: string | null;
  role: RoleName;
  disabled: boolean;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  activeSessions: number;
  /** Display strings, made on the server so the client never re-renders a time. */
  lastLogin: { label: string; title: string };
  joined: { label: string; title: string };
  self: boolean;
  can: {
    roles: RoleName[];
    disable: boolean;
    reset: boolean;
    delete: boolean;
    signOut: boolean;
  };
}

export const initials = (row: Pick<UserRowView, "name" | "email">) =>
  (row.name?.trim() || row.email)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

function Section({ icon, title, children, tone }: { icon: ReactNode; title: string; children: ReactNode; tone?: "danger" }) {
  return (
    <section
      className={
        tone === "danger" ? "space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4" : "space-y-3 rounded-lg border border-border p-4"
      }
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function ManageUserSheet({
  row,
  open,
  onClose,
  canViewSessions,
}: {
  row: UserRowView | null;
  open: boolean;
  onClose: () => void;
  canViewSessions: boolean;
}) {
  const nothing = row ? row.can.roles.length === 0 && !row.can.disable && !row.can.reset && !row.can.delete && !row.can.signOut : true;

  return (
    <Sheet open={open && row !== null} onClose={onClose} title={row ? (row.name ?? row.email) : ""} description={row?.name ? row.email : undefined}>
      {row ? (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {initials(row)}
            </span>
            <div className="flex flex-wrap gap-1.5">
              <span className={badgeClass}>{ROLE_LABEL[row.role]}</span>
              <span className={badgeClass}>{row.disabled ? "Disabled" : "Active"}</span>
              {row.mfaEnabled ? <span className={badgeClass}>Two-factor</span> : null}
              {row.mustChangePassword ? <span className={badgeClass}>Must change password</span> : null}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Last sign-in</dt>
              <dd title={row.lastLogin.title}>{row.lastLogin.label}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Joined</dt>
              <dd title={row.joined.title}>{row.joined.label}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Sessions</dt>
              <dd className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {row.activeSessions} active {row.activeSessions === 1 ? "session" : "sessions"}
                </span>
                {canViewSessions ? (
                  <Link
                    href={`/admin/sessions?status=all&user=${encodeURIComponent(row.id)}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    View sessions
                    <ArrowRight aria-hidden className="size-3.5" />
                  </Link>
                ) : null}
              </dd>
            </div>
          </dl>

          {row.self ? (
            <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
              This is your account. Change your own details and password under{" "}
              <Link href="/admin/account" className="font-medium text-foreground underline underline-offset-4">
                Account
              </Link>
              .
            </p>
          ) : nothing ? (
            <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">You can see this account but not change it.</p>
          ) : null}

          {row.can.roles.length > 0 ? (
            <Section icon={<UserCog aria-hidden className="size-4 text-muted-foreground" />} title="Role">
              {/* Keyed to the role, so the select shows the saved value after a change. */}
              <ActionForm key={row.role} action={changeRole} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="userId" value={row.id} />
                <div className="min-w-40 flex-1">
                  <label htmlFor={`sheet-role-${row.id}`} className="sr-only">
                    Role
                  </label>
                  <RoleSelect id={`sheet-role-${row.id}`} roles={row.can.roles} defaultValue={row.role} />
                </div>
                <SubmitButton variant="secondary" pendingLabel="Saving...">
                  Save role
                </SubmitButton>
              </ActionForm>
            </Section>
          ) : null}

          {row.can.reset || (row.can.signOut && row.activeSessions > 0) ? (
            <Section icon={<KeyRound aria-hidden className="size-4 text-muted-foreground" />} title="Sign-in">
              {row.can.reset ? (
                row.disabled ? (
                  <p className="text-sm text-muted-foreground">Enable the account before sending a reset link.</p>
                ) : (
                  <ActionForm action={sendReset}>
                    <input type="hidden" name="userId" value={row.id} />
                    <SubmitButton variant="secondary" pendingLabel="Sending...">
                      Email a password reset link
                    </SubmitButton>
                  </ActionForm>
                )
              ) : null}
              {row.can.signOut && row.activeSessions > 0 ? (
                <ActionForm action={forceLogoutUser}>
                  <input type="hidden" name="userId" value={row.id} />
                  <ConfirmSubmitButton
                    variant="secondary"
                    pendingLabel="Signing out..."
                    confirmMessage={`Sign ${row.email} out of ${row.activeSessions} ${row.activeSessions === 1 ? "session" : "sessions"}? They are told by email.`}
                  >
                    <LogOut aria-hidden className="size-4" />
                    Sign out everywhere
                  </ConfirmSubmitButton>
                </ActionForm>
              ) : null}
            </Section>
          ) : null}

          {row.can.disable ? (
            <Section icon={<ShieldCheck aria-hidden className="size-4 text-muted-foreground" />} title="Access">
              <p className="text-sm text-muted-foreground">
                {row.disabled
                  ? "This account cannot sign in. Enabling it lets them sign in again with their password."
                  : "Disabling blocks sign-in at once, ends every session and cancels the invitations they sent."}
              </p>
              <ActionForm key={String(row.disabled)} action={setDisabled}>
                <input type="hidden" name="userId" value={row.id} />
                <input type="hidden" name="disabled" value={row.disabled ? "false" : "true"} />
                {row.disabled ? (
                  <SubmitButton variant="secondary" pendingLabel="Enabling...">
                    Enable account
                  </SubmitButton>
                ) : (
                  <ConfirmSubmitButton variant="danger" pendingLabel="Disabling..." confirmMessage={`Disable ${row.email} and sign them out everywhere?`}>
                    Disable and sign out
                  </ConfirmSubmitButton>
                )}
              </ActionForm>
            </Section>
          ) : null}

          {row.can.delete ? (
            <Section icon={null} title="Delete account" tone="danger">
              <p className="text-sm text-muted-foreground">
                Removes the account, its sessions and its open links. Their posts and inquiries stay, without an author.
              </p>
              <ActionForm action={deleteUser} className="space-y-3">
                <input type="hidden" name="userId" value={row.id} />
                <Field label={`Type ${row.email} to confirm`} name="confirm" autoComplete="off" placeholder={row.email} />
                <ConfirmSubmitButton variant="danger" pendingLabel="Deleting..." confirmMessage={`Delete ${row.email}? This cannot be undone.`}>
                  Delete user
                </ConfirmSubmitButton>
              </ActionForm>
            </Section>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
