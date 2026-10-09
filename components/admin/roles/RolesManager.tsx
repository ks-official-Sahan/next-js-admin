"use client";

import { useState } from "react";

import ActionForm, { ConfirmSubmitButton, Field, SubmitButton } from "@/components/admin/ui/ActionForm";
import { buttonVariants, tableClass } from "@/components/admin/ui/styles";
import { createRoleAction, deleteRoleAction, updateRoleAction } from "@/lib/actions/roles";

export interface RoleRow {
  name: string;
  label: string;
  description: string | null;
  rank: number;
  system: boolean;
  users: number;
  /** Ranked below the viewer (any role, for the super role): may be edited or deleted. */
  editable: boolean;
}

type Mode = { kind: "add" } | { kind: "edit"; role: RoleRow } | null;

/**
 * The roles table, with one add or edit form open at a time (so field ids
 * never repeat on the page). Built-in roles cannot be deleted, and a custom
 * role only once nobody holds it.
 */
/** `superRole` is null when the viewer does not see it. */
export default function RolesManager({ roles, superRole }: { roles: RoleRow[]; superRole: string | null }) {
  const [mode, setMode] = useState<Mode>(null);
  const close = () => setMode(null);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className={tableClass}>
          <thead className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2">Role</th>
              <th scope="col" className="w-20 px-3 py-2 text-right">Rank</th>
              <th scope="col" className="w-20 px-3 py-2 text-right">Users</th>
              <th scope="col" className="w-44 px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {roles.map((role) => (
              <tr key={role.name}>
                <th scope="row" className="px-3 py-2.5 text-left font-normal">
                  <div className="font-medium">
                    {role.label}{" "}
                    <span className="font-mono text-xs text-muted-foreground">{role.name}</span>
                    {role.system ? <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Built in</span> : null}
                  </div>
                  {role.description ? <div className="text-xs text-muted-foreground">{role.description}</div> : null}
                </th>
                <td className="px-3 py-2.5 text-right tabular-nums">{role.rank}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{role.users}</td>
                <td className="px-3 py-2.5">
                  <div className="flex justify-end gap-2">
                    {role.editable ? (
                      <button type="button" className={buttonVariants.small} onClick={() => setMode({ kind: "edit", role })} aria-label={`Edit ${role.label}`}>
                        Edit
                      </button>
                    ) : null}
                    {role.editable && !role.system && role.users === 0 ? (
                      <ActionForm action={deleteRoleAction} showMessage={false}>
                        <input type="hidden" name="role" value={role.name} />
                        <ConfirmSubmitButton variant="smallDanger" pendingLabel="Deleting..." confirmMessage={`Delete the ${role.label} role? Open invitations for it are cancelled.`}>
                          Delete
                        </ConfirmSubmitButton>
                      </ActionForm>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        A role manages every role with a higher rank number, never its own rank or above.
        {superRole ? ` ${roles.find((role) => role.name === superRole)?.label ?? superRole} (rank 0) manages everyone.` : null}
      </p>

      {mode === null ? (
        <button type="button" className={buttonVariants.secondary} onClick={() => setMode({ kind: "add" })}>
          Add a role
        </button>
      ) : mode.kind === "add" ? (
        <RoleForm key="add" title="Add a role" onDone={close} />
      ) : (
        <RoleForm key={mode.role.name} title={`Edit ${mode.role.label}`} role={mode.role} lockedRank={mode.role.name === superRole} onDone={close} />
      )}
    </div>
  );
}

function RoleForm({ title, role, lockedRank, onDone }: { title: string; role?: RoleRow; lockedRank?: boolean; onDone: () => void }) {
  return (
    <section aria-label={title} className="rounded-lg border border-border p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <ActionForm action={role ? updateRoleAction : createRoleAction} onResult={(state) => state.ok && onDone()} className="grid gap-4 sm:grid-cols-2">
        {role ? (
          <input type="hidden" name="role" value={role.name} />
        ) : (
          <Field label="Name" name="name" required maxLength={32} placeholder="SUPPORT" hint="Capital letters, digits and underscores. It cannot be changed later." />
        )}
        <Field label="Label" name="label" required maxLength={60} defaultValue={role?.label ?? ""} placeholder="Support" />
        {lockedRank ? null : (
          <Field
            label="Rank"
            name="rank"
            type="number"
            inputMode="numeric"
            required
            defaultValue={role ? String(role.rank) : "30"}
            hint="1 to 1000. Lower ranks manage higher ones; see the ranks in the table above."
          />
        )}
        <Field label="Description" name="description" multiline maxLength={300} defaultValue={role?.description ?? ""} className="sm:col-span-2" />
        <div className="flex gap-2 sm:col-span-2">
          <SubmitButton pendingLabel="Saving...">{role ? "Save role" : "Add role"}</SubmitButton>
          <button type="button" className={buttonVariants.secondary} onClick={onDone}>
            Cancel
          </button>
        </div>
      </ActionForm>
    </section>
  );
}
