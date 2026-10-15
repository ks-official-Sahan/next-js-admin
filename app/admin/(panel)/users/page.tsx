import type { Metadata } from "next";
import Link from "next/link";

import SignInLinkCard from "@/components/admin/account/SignInLinkCard";
import EmptyState from "@/components/admin/ui/EmptyState";
import { badgeClass, cardClass, tableClass, tdClass, thClass } from "@/components/admin/ui/styles";
import { CreateUserForm, InviteForm, InviteRowActions } from "@/components/admin/users/UserForms";
import UsersTable, { type BulkCapabilities, type SortColumn, type SortHeader, type UserRowView } from "@/components/admin/users/UsersTable";
import UsersToolbar from "@/components/admin/users/UsersToolbar";
import { formatDateTime, relativeTime } from "@/lib/admin/format";
import { ROLE_LABEL } from "@/lib/admin/roles";
import { hasPermission, requirePermission } from "@/lib/auth/dal";
import { getDeveloperMask } from "@/lib/auth/mask";
import { MASK_ROLE, SUPER_ROLE } from "@/lib/auth/permissions";
import { getRoleCatalog } from "@/lib/auth/roles";
import { mayDeleteUsers } from "@/lib/users/rules";
import { isFiltered, parseUserView, USER_PAGE_SIZE, userQueryOf, userViewSearch, type SearchParams } from "@/lib/users/query";
import { listPendingInvites, searchUsers } from "@/lib/users/service";

export const metadata: Metadata = { title: "Users" };

const USERS_PATH = "/admin/users";

// Read outside the component: a server render is one request, and this is its clock.
const clock = () => Date.now();

// Accounts are searched, filtered, sorted and paged in the database from the
// URL (lib/users/query.ts), so the screen stays fast however many people
// there are. Each row's capabilities are worked out here from the same rules
// the actions enforce; the client only decides what to show.
export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePermission("viewUsers");
  const view = parseUserView(await searchParams);
  const [catalog, mask] = await Promise.all([getRoleCatalog(), getDeveloperMask()]);
  const [page, invites] = await Promise.all([searchUsers({ ...userQueryOf(view), present: mask.presentFor(actor) }), listPendingInvites()]);
  // Every role is shown as this viewer may see it (lib/auth/mask.ts); every
  // capability below still comes from the real role.
  const visibleRoles = mask.visibleRoles(actor, catalog.roles, mask.unmaskedCount).map((role) => role.name);
  const shownInviteRole = (role: string) => (role === SUPER_ROLE && !visibleRoles.includes(SUPER_ROLE) ? MASK_ROLE : role);
  const now = clock();

  const roles = catalog.assignable(actor.role);
  const mayManage = hasPermission(actor, "manageUsers");
  const mayInvite = hasPermission(actor, "inviteUser") && roles.length > 0;
  const mayCreate = mayManage && roles.length > 0;
  const mayDelete = hasPermission(actor, "deleteUser") && mayDeleteUsers(actor.role);
  const bulk: BulkCapabilities = {
    roles: mayManage ? [...roles] : [],
    disable: mayManage,
    signOut: hasPermission(actor, "forceLogout"),
    delete: mayDelete,
  };

  const rows: UserRowView[] = page.items.map((user) => {
    const manageable = catalog.canManage(actor, { id: user.id, role: user.role });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: mask.roleFor(actor, user),
      masked: mask.seesThrough(actor) && mask.isMasked(user),
      disabled: Boolean(user.disabledAt),
      mfaEnabled: user.mfaEnabled,
      mustChangePassword: user.mustChangePassword,
      activeSessions: user.activeSessions,
      lastLogin: { label: relativeTime(user.lastLoginAt, now), title: formatDateTime(user.lastLoginAt) },
      joined: { label: relativeTime(user.createdAt, now), title: formatDateTime(user.createdAt) },
      self: user.id === actor.id,
      can: {
        roles: manageable && mayManage ? [...roles] : [],
        disable: manageable && mayManage,
        reset: manageable && hasPermission(actor, "resetPassword"),
        delete: manageable && mayDelete,
        signOut: manageable && hasPermission(actor, "forceLogout"),
        // Resetting someone's second factors: developers only, never their own row.
        factors: mayManage && actor.role === SUPER_ROLE && user.id !== actor.id,
      },
    };
  });

  // A column link sorts by that column, and a second click reverses it.
  const sortHeader = (column: SortColumn, firstDir: "asc" | "desc"): SortHeader => {
    const active = view.sort === column;
    const dir = active ? (view.dir === "asc" ? "desc" : "asc") : firstDir;
    return {
      href: `${USERS_PATH}${userViewSearch(view, { sort: column, dir, page: 1 })}`,
      state: active ? (view.dir === "asc" ? "ascending" : "descending") : undefined,
    };
  };
  const sort: Record<SortColumn, SortHeader> = {
    name: sortHeader("name", "asc"),
    role: sortHeader("role", "asc"),
    "last-login": sortHeader("last-login", "desc"),
    created: sortHeader("created", "desc"),
  };

  const totalPages = Math.max(1, Math.ceil(page.total / USER_PAGE_SIZE));
  const firstRow = page.total === 0 ? 0 : (view.page - 1) * USER_PAGE_SIZE + 1;
  const lastRow = Math.min(view.page * USER_PAGE_SIZE, page.total);
  const pageHref = (target: number) => `${USERS_PATH}${userViewSearch(view, { page: target })}`;

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
                Invite
              </h2>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">
                They choose their own password. The link works once and lasts 72 hours, and you can copy it to share yourself.
              </p>
              <InviteForm roles={roles} />
            </section>
          ) : null}
          {mayCreate ? (
            <section className={cardClass} aria-labelledby="create-heading">
              <h2 id="create-heading" className="text-base font-medium">
                Create with a password
              </h2>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">For someone you can hand a password to in person.</p>
              <CreateUserForm roles={roles} />
            </section>
          ) : null}
        </div>
      ) : null}

      <section aria-labelledby="accounts-heading" className="space-y-3">
        <h2 id="accounts-heading" className="text-base font-medium">
          Accounts
        </h2>
        <UsersToolbar view={view} roles={visibleRoles} total={page.total} />

        {rows.length === 0 ? (
          isFiltered(view) ? (
            <EmptyState
              title="No users match"
              description="Try another search, or clear the filters."
              action={
                <Link href={USERS_PATH} className="text-sm font-medium underline underline-offset-4">
                  Clear filters
                </Link>
              }
            />
          ) : view.page > 1 ? (
            <EmptyState
              title="This page is empty"
              action={
                <Link href={pageHref(1)} className="text-sm font-medium underline underline-offset-4">
                  Go to the first page
                </Link>
              }
            />
          ) : (
            <EmptyState title="No users yet" description="Invite someone to get started." />
          )
        ) : (
          <UsersTable
            rows={rows}
            viewKey={userViewSearch(view)}
            bulk={bulk}
            sort={sort}
            canViewSessions={hasPermission(actor, "viewSessions")}
          />
        )}

        {page.total > USER_PAGE_SIZE ? (
          <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              {firstRow}–{lastRow} of {page.total}
            </span>
            <span className="flex items-center gap-2">
              {view.page > 1 ? (
                <Link href={pageHref(view.page - 1)} scroll={false} className="rounded-md border border-input px-3 py-1.5 hover:bg-muted">
                  Previous
                </Link>
              ) : null}
              <span aria-current="page">
                Page {view.page} of {totalPages}
              </span>
              {view.page < totalPages ? (
                <Link href={pageHref(view.page + 1)} scroll={false} className="rounded-md border border-input px-3 py-1.5 hover:bg-muted">
                  Next
                </Link>
              ) : null}
            </span>
          </nav>
        ) : null}
      </section>

      <section aria-labelledby="invites-heading">
        <h2 id="invites-heading" className="mb-3 text-base font-medium">
          Open invitations ({invites.length})
        </h2>
        {invites.length === 0 ? (
          <EmptyState title="No open invitations" description="An invitation shows here until it is accepted, cancelled or expires." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className={tableClass}>
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th scope="col" className={thClass}>
                    Email
                  </th>
                  <th scope="col" className={thClass}>
                    Role
                  </th>
                  <th scope="col" className={thClass}>
                    Invited by
                  </th>
                  <th scope="col" className={thClass}>
                    Expires
                  </th>
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
                      <span className={badgeClass}>{ROLE_LABEL[shownInviteRole(invite.role)]}</span>
                    </td>
                    <td className={tdClass}>{invite.createdByEmail ?? "Unknown"}</td>
                    <td className={tdClass}>{formatDateTime(invite.expiresAt)}</td>
                    <td className={`${tdClass} text-right`}>
                      {hasPermission(actor, "inviteUser") && roles.includes(invite.role) ? (
                        <InviteRowActions inviteId={invite.id} email={invite.email} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {mayInvite || mayManage ? <SignInLinkCard audience="team" /> : null}
    </div>
  );
}
