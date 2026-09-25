import type { Metadata } from "next";

import { CancelInviteForm, CreateUserForm, InviteForm, UserActions } from "@/components/admin/users/UserForms";
import EmptyState from "@/components/admin/ui/EmptyState";
import { badgeClass, cardClass, tableClass, tdClass, thClass } from "@/components/admin/ui/styles";
import { formatDateTime, relativeTime } from "@/lib/admin/format";
import { ROLE_LABEL } from "@/lib/admin/roles";
import { hasPermission, requirePermission } from "@/lib/auth/dal";
import { assignableRoles, canManage } from "@/lib/auth/rbac-rules";
import { listPendingInvites, listUsers } from "@/lib/users/service";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const actor = await requirePermission("viewUsers");
  const [users, invites] = await Promise.all([listUsers(), listPendingInvites()]);

  const roles = assignableRoles(actor.role);
  const mayInvite = hasPermission(actor, "inviteUser") && roles.length > 0;
  const mayCreate = hasPermission(actor, "manageUsers") && roles.length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Who can sign in to the admin, and what they can do. Every change is written to the audit log.
        </p>
      </div>

      {mayInvite || mayCreate ? (
        <div className="grid gap-6 s768:grid-cols-2">
          {mayInvite ? (
            <section className={cardClass} aria-labelledby="invite-heading">
              <h2 id="invite-heading" className="text-base font-medium">
                Invite by email
              </h2>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">
                They choose their own password. The link works once and lasts 72 hours.
              </p>
              <InviteForm roles={roles} />
            </section>
          ) : null}
          {mayCreate ? (
            <section className={cardClass} aria-labelledby="create-heading">
              <h2 id="create-heading" className="text-base font-medium">
                Create with a password
              </h2>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">
                For someone you can hand a password to in person.
              </p>
              <CreateUserForm roles={roles} />
            </section>
          ) : null}
        </div>
      ) : null}

      <section aria-labelledby="accounts-heading">
        <h2 id="accounts-heading" className="mb-3 text-base font-medium">
          Accounts ({users.length})
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className={tableClass}>
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th scope="col" className={thClass}>User</th>
                <th scope="col" className={thClass}>Role</th>
                <th scope="col" className={thClass}>Status</th>
                <th scope="col" className={thClass}>Last sign-in</th>
                <th scope="col" className={thClass}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => {
                const manageable = canManage(actor, { id: user.id, role: user.role });
                const canManageUsers = manageable && hasPermission(actor, "manageUsers");
                const can = {
                  roles: canManageUsers ? roles : [],
                  canDisable: canManageUsers,
                  canReset: manageable && hasPermission(actor, "resetPassword"),
                  canDelete: manageable && hasPermission(actor, "deleteUser") && actor.role === "DEVELOPER",
                };
                return (
                  <tr key={user.id}>
                    <td className={tdClass}>
                      <div className="font-medium">
                        {user.name ?? user.email}
                        {user.id === actor.id ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>
                        ) : null}
                      </div>
                      {user.name ? <div className="text-xs text-muted-foreground">{user.email}</div> : null}
                    </td>
                    <td className={tdClass}>
                      <span className={badgeClass}>{ROLE_LABEL[user.role]}</span>
                    </td>
                    <td className={tdClass}>
                      <div className="flex flex-wrap gap-1.5">
                        <span className={badgeClass}>{user.disabledAt ? "Disabled" : "Active"}</span>
                        {user.mfaEnabled ? <span className={badgeClass}>Two-factor</span> : null}
                        {user.mustChangePassword ? <span className={badgeClass}>Must change password</span> : null}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {user.activeSessions} active {user.activeSessions === 1 ? "session" : "sessions"}
                      </div>
                    </td>
                    <td className={tdClass} title={formatDateTime(user.lastLoginAt)}>
                      {relativeTime(user.lastLoginAt)}
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <UserActions
                        user={{ id: user.id, email: user.email, role: user.role, disabled: Boolean(user.disabledAt) }}
                        can={can}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="invites-heading">
        <h2 id="invites-heading" className="mb-3 text-base font-medium">
          Open invitations ({invites.length})
        </h2>
        {invites.length === 0 ? (
          <EmptyState
            title="No open invitations"
            description="An invitation shows here until it is accepted, cancelled or expires."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className={tableClass}>
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th scope="col" className={thClass}>Email</th>
                  <th scope="col" className={thClass}>Role</th>
                  <th scope="col" className={thClass}>Invited by</th>
                  <th scope="col" className={thClass}>Expires</th>
                  <th scope="col" className={thClass}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invites.map((invite) => (
                  <tr key={invite.id}>
                    <td className={tdClass}>{invite.email}</td>
                    <td className={tdClass}>
                      <span className={badgeClass}>{ROLE_LABEL[invite.role]}</span>
                    </td>
                    <td className={tdClass}>{invite.createdByEmail ?? "Unknown"}</td>
                    <td className={tdClass}>{formatDateTime(invite.expiresAt)}</td>
                    <td className={`${tdClass} text-right`}>
                      {hasPermission(actor, "inviteUser") && roles.includes(invite.role) ? (
                        <CancelInviteForm inviteId={invite.id} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
