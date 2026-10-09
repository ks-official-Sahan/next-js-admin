"use client";

import { useState } from "react";

import ActionForm, { ConfirmSubmitButton } from "@/components/admin/ui/ActionForm";
import { badgeClass, tableClass, tdClass, thClass } from "@/components/admin/ui/styles";
import { endSessions } from "@/lib/actions/sessions";
import type { ActionState } from "@/lib/actions/state";
import { cn } from "@/lib/utils";

import { RevokeSessionForm } from "./SessionForms";

export interface SessionRowView {
  id: string;
  userName: string | null;
  userEmail: string;
  device: string;
  ip: string;
  /** Display strings, made on the server so the client never re-renders a time. */
  lastSeen: { label: string; title: string };
  started: string;
  status: "Active" | "Ended" | "Expired";
  current: boolean;
  mfaVerified: boolean;
  revokeReason: string | null;
  /** Live, not this device, and within the actor's reach. */
  canEnd: boolean;
}

const EMPTY: ReadonlySet<string> = new Set();

/**
 * The sessions table with a selection for ending several at once. The
 * selection is keyed to the URL the rows came from, and only rows the actor
 * may end can be selected; the server checks each one again.
 */
export default function SessionsTable({ rows, viewKey, mayRevoke }: { rows: SessionRowView[]; viewKey: string; mayRevoke: boolean }) {
  const [selection, setSelection] = useState({ key: viewKey, ids: EMPTY });
  const endable = rows.filter((row) => row.canEnd);
  const endableIds = new Set(endable.map((row) => row.id));
  const selected = selection.key === viewKey ? new Set([...selection.ids].filter((id) => endableIds.has(id))) : new Set<string>();

  const setSelected = (ids: ReadonlySet<string>) => setSelection({ key: viewKey, ids });
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const allSelected = endable.length > 0 && endable.every((row) => selected.has(row.id));
  const afterBulk = (state: ActionState) => {
    if (state.ok) setSelected(new Set());
  };
  const selectable = mayRevoke && endable.length > 0;
  const count = selected.size;

  return (
    <>
      {selectable && count > 0 ? (
        <div
          role="region"
          aria-label="Bulk actions"
          className="sticky top-16 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85"
        >
          <span className="text-sm font-medium" aria-live="polite">
            {count} selected
          </span>
          <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Clear
          </button>
          <ActionForm action={endSessions} onResult={afterBulk} showMessage={false} className="ml-auto">
            {[...selected].map((id) => (
              <input key={id} type="hidden" name="ids" value={id} />
            ))}
            <ConfirmSubmitButton
              variant="smallDanger"
              pendingLabel="Ending..."
              confirmMessage={`End ${count} ${count === 1 ? "session" : "sessions"}? Those devices are signed out on their next request.`}
            >
              End {count === 1 ? "session" : "sessions"}
            </ConfirmSubmitButton>
          </ActionForm>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className={cn(tableClass, "min-w-0 s768:min-w-[40rem]")}>
          <thead className="border-b border-border bg-muted/40">
            <tr>
              {selectable ? (
                <th scope="col" className={cn(thClass, "w-10")}>
                  <input
                    type="checkbox"
                    aria-label="Select every session on this page that you can end"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(endableIds))}
                    className="size-4 accent-primary"
                  />
                </th>
              ) : null}
              <th scope="col" className={thClass}>
                User
              </th>
              <th scope="col" className={cn(thClass, "hidden s640:table-cell")}>
                Device
              </th>
              <th scope="col" className={thClass}>
                Last active
              </th>
              <th scope="col" className={cn(thClass, "hidden s768:table-cell")}>
                Status
              </th>
              <th scope="col" className={thClass}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className={cn(selected.has(row.id) && "bg-primary/5", row.status !== "Active" && "text-muted-foreground")}>
                {selectable ? (
                  <td className={tdClass}>
                    {row.canEnd ? (
                      <input
                        type="checkbox"
                        aria-label={`Select the session of ${row.userName ?? row.userEmail} on ${row.device}`}
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                        className="size-4 accent-primary"
                      />
                    ) : null}
                  </td>
                ) : null}
                <td className={tdClass}>
                  <div className="font-medium text-foreground">{row.userName ?? row.userEmail}</div>
                  {row.userName ? <div className="text-xs text-muted-foreground">{row.userEmail}</div> : null}
                  {/* The columns hidden on small screens, folded under the name. */}
                  <div className="mt-1 text-xs text-muted-foreground s640:hidden">
                    {row.device} · {row.ip}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5 s768:hidden">
                    <span className={badgeClass}>{row.status}</span>
                    {row.current ? <span className={badgeClass}>This device</span> : null}
                  </div>
                </td>
                <td className={cn(tdClass, "hidden s640:table-cell")}>
                  <div>{row.device}</div>
                  <div className="text-xs text-muted-foreground">{row.ip}</div>
                </td>
                <td className={tdClass} title={row.lastSeen.title}>
                  {row.lastSeen.label}
                  <div className="text-xs text-muted-foreground">Started {row.started}</div>
                </td>
                <td className={cn(tdClass, "hidden s768:table-cell")}>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={badgeClass}>{row.status}</span>
                    {row.current ? <span className={badgeClass}>This device</span> : null}
                    {row.mfaVerified ? <span className={badgeClass}>Two-factor</span> : null}
                  </div>
                  {row.revokeReason ? <div className="mt-1 text-xs text-muted-foreground">{row.revokeReason}</div> : null}
                </td>
                <td className={cn(tdClass, "text-right")}>{row.canEnd && mayRevoke ? <RevokeSessionForm sessionId={row.id} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
