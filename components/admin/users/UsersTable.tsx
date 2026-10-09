"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Settings2 } from "lucide-react";
import { useState } from "react";

import ActionForm, { ConfirmSubmitButton, SubmitButton } from "@/components/admin/ui/ActionForm";
import { badgeClass, fieldClass, tableClass, tdClass, thClass } from "@/components/admin/ui/styles";
import { bulkUsers } from "@/lib/actions/users";
import type { ActionState } from "@/lib/actions/state";
import { ROLE_LABEL } from "@/lib/admin/roles";
import type { RoleName } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

import ManageUserSheet, { initials, type UserRowView } from "./ManageUserSheet";

export type { UserRowView };

export interface BulkCapabilities {
  /** Roles this actor may give (empty: no bulk role change). */
  roles: RoleName[];
  disable: boolean;
  signOut: boolean;
  delete: boolean;
}

export type SortColumn = "name" | "role" | "last-login" | "created";

export interface SortHeader {
  href: string;
  /** For aria-sort; undefined when the list is not sorted by this column. */
  state?: "ascending" | "descending";
}

const EMPTY: ReadonlySet<string> = new Set();

function SortLink({ label, header }: { label: string; header: SortHeader }) {
  const Icon = header.state === "ascending" ? ArrowUp : header.state === "descending" ? ArrowDown : ArrowUpDown;
  return (
    <Link href={header.href} scroll={false} replace className="inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {label}
      <Icon aria-hidden className={cn("size-3", !header.state && "opacity-40")} />
    </Link>
  );
}

/**
 * The accounts table. Selection is keyed to the URL the rows came from, so a
 * new search, filter, sort or page starts with nothing selected, and an id
 * that left the list (deleted) drops out of the selection on its own.
 */
export default function UsersTable({
  rows,
  viewKey,
  bulk,
  sort,
  canViewSessions,
}: {
  rows: UserRowView[];
  viewKey: string;
  bulk: BulkCapabilities;
  sort: Record<SortColumn, SortHeader>;
  canViewSessions: boolean;
}) {
  const [selection, setSelection] = useState({ key: viewKey, ids: EMPTY as ReadonlySet<string> });
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleteText, setDeleteText] = useState("");

  const rowIds = new Set(rows.map((row) => row.id));
  const selected = selection.key === viewKey ? new Set([...selection.ids].filter((id) => rowIds.has(id))) : new Set<string>();
  const selectable = rows.filter((row) => !row.self);
  const bulkEnabled = bulk.roles.length > 0 || bulk.disable || bulk.signOut || bulk.delete;

  const setSelected = (ids: ReadonlySet<string>) => setSelection({ key: viewKey, ids });
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const allSelected = selectable.length > 0 && selectable.every((row) => selected.has(row.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectable.map((row) => row.id)));
  const afterBulk = (state: ActionState) => {
    if (!state.ok) return;
    setSelected(new Set());
    setDeleteText("");
  };

  const openRow = rows.find((row) => row.id === openId) ?? null;
  const count = selected.size;
  const users = `${count} ${count === 1 ? "user" : "users"}`;
  const hiddenIds = [...selected].map((id) => <input key={id} type="hidden" name="ids" value={id} />);

  return (
    <>
      {bulkEnabled && count > 0 ? (
        <div
          role="region"
          aria-label="Bulk actions"
          className="sticky top-16 z-20 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-border bg-background/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85"
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium" aria-live="polite">
              {count} selected
            </span>
            <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Clear
            </button>
          </div>

          <ActionForm action={bulkUsers} onResult={afterBulk} showMessage={false} className="flex flex-wrap items-center gap-2">
            {hiddenIds}
            {bulk.roles.length > 0 ? (
              <span className="flex items-center gap-2">
                <label htmlFor="bulk-role" className="sr-only">
                  New role
                </label>
                <select id="bulk-role" name="role" defaultValue="" className={cn(fieldClass, "h-8 w-auto py-0 text-xs")}>
                  <option value="" disabled>
                    Change role to…
                  </option>
                  {bulk.roles.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </select>
                <SubmitButton name="op" value="role" variant="small" pendingLabel="Saving...">
                  Apply
                </SubmitButton>
              </span>
            ) : null}
            {bulk.disable ? (
              <>
                <SubmitButton name="op" value="enable" variant="small" pendingLabel="Working...">
                  Enable
                </SubmitButton>
                <ConfirmSubmitButton
                  name="op"
                  value="disable"
                  variant="smallDanger"
                  pendingLabel="Working..."
                  confirmMessage={`Disable ${users} and sign them out everywhere?`}
                >
                  Disable
                </ConfirmSubmitButton>
              </>
            ) : null}
            {bulk.signOut ? (
              <ConfirmSubmitButton
                name="op"
                value="sign-out"
                variant="small"
                pendingLabel="Signing out..."
                confirmMessage={`Sign ${users} out of every session? They are told by email.`}
              >
                Sign out everywhere
              </ConfirmSubmitButton>
            ) : null}
          </ActionForm>

          {bulk.delete ? (
            <ActionForm action={bulkUsers} onResult={afterBulk} showMessage={false} className="flex flex-wrap items-center gap-2">
              {hiddenIds}
              <label htmlFor="bulk-delete-confirm" className="sr-only">
                Type delete to confirm
              </label>
              <input
                id="bulk-delete-confirm"
                name="confirm"
                value={deleteText}
                onChange={(event) => setDeleteText(event.target.value)}
                placeholder='Type "delete"'
                autoComplete="off"
                className={cn(fieldClass, "h-8 w-32 text-xs")}
              />
              <ConfirmSubmitButton
                name="op"
                value="delete"
                variant="smallDanger"
                pendingLabel="Deleting..."
                confirmMessage={`Delete ${users}? This cannot be undone.`}
              >
                Delete
              </ConfirmSubmitButton>
            </ActionForm>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className={cn(tableClass, "min-w-0 s768:min-w-[40rem]")}>
          <thead className="border-b border-border bg-muted/40">
            <tr>
              {bulkEnabled ? (
                <th scope="col" className={cn(thClass, "w-10")}>
                  <input
                    type="checkbox"
                    aria-label="Select every user on this page"
                    checked={allSelected}
                    disabled={selectable.length === 0}
                    onChange={toggleAll}
                    className="size-4 accent-primary"
                  />
                </th>
              ) : null}
              <th scope="col" className={thClass} aria-sort={sort.name.state}>
                <SortLink label="User" header={sort.name} />
              </th>
              <th scope="col" className={cn(thClass, "hidden s640:table-cell")} aria-sort={sort.role.state}>
                <SortLink label="Role" header={sort.role} />
              </th>
              <th scope="col" className={cn(thClass, "hidden s768:table-cell")}>
                Status
              </th>
              <th scope="col" className={cn(thClass, "hidden lg:table-cell")} aria-sort={sort["last-login"].state}>
                <SortLink label="Last sign-in" header={sort["last-login"]} />
              </th>
              <th scope="col" className={thClass}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className={cn(selected.has(row.id) && "bg-primary/5", row.disabled && "text-muted-foreground")}>
                {bulkEnabled ? (
                  <td className={tdClass}>
                    {row.self ? null : (
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.name ?? row.email}`}
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                        className="size-4 accent-primary"
                      />
                    )}
                  </td>
                ) : null}
                <td className={tdClass}>
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="mt-0.5 hidden size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold s640:flex">
                      {initials(row)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {row.name ?? row.email}
                        {row.self ? <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span> : null}
                      </div>
                      {row.name ? <div className="truncate text-xs text-muted-foreground">{row.email}</div> : null}
                      {/* The columns hidden on small screens, folded under the name. */}
                      <div className="mt-1 flex flex-wrap gap-1.5 s768:hidden">
                        <span className={cn(badgeClass, "s640:hidden")}>{ROLE_LABEL[row.role]}</span>
                        {row.masked ? <span className={cn(badgeClass, "s640:hidden")}>Masked</span> : null}
                        {row.disabled ? <span className={badgeClass}>Disabled</span> : null}
                        {row.mustChangePassword ? <span className={badgeClass}>Must change password</span> : null}
                      </div>
                    </div>
                  </div>
                </td>
                <td className={cn(tdClass, "hidden s640:table-cell")}>
                  <span className={badgeClass}>{ROLE_LABEL[row.role]}</span>
                  {row.masked ? <span className={cn(badgeClass, "ml-1.5")}>Masked</span> : null}
                </td>
                <td className={cn(tdClass, "hidden s768:table-cell")}>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={badgeClass}>{row.disabled ? "Disabled" : "Active"}</span>
                    {row.mfaEnabled ? <span className={badgeClass}>Two-factor</span> : null}
                    {row.mustChangePassword ? <span className={badgeClass}>Must change password</span> : null}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.activeSessions} active {row.activeSessions === 1 ? "session" : "sessions"}
                  </div>
                </td>
                <td className={cn(tdClass, "hidden lg:table-cell")} title={row.lastLogin.title}>
                  {row.lastLogin.label}
                </td>
                <td className={cn(tdClass, "text-right")}>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => setOpenId(row.id)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Settings2 aria-hidden className="size-3.5" />
                    {row.self ? "View" : "Manage"}
                    <span className="sr-only"> {row.name ?? row.email}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ManageUserSheet row={openRow} open={openRow !== null} onClose={() => setOpenId(null)} canViewSessions={canViewSessions} />
    </>
  );
}
