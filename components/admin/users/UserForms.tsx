"use client";

import { changeRole, createUser, deleteUser, inviteUser, revokeInvite, sendReset, setDisabled } from "@/lib/actions/users";
import ActionForm, { Field, SubmitButton } from "@/components/admin/ui/ActionForm";
import { fieldClass } from "@/components/admin/ui/styles";
import { ROLE_LABEL } from "@/lib/admin/roles";
import type { RoleName } from "@/lib/auth/permissions";

function RoleSelect({ roles, defaultValue, id }: { roles: readonly RoleName[]; defaultValue?: RoleName; id: string }) {
  return (
    <select id={id} name="role" defaultValue={defaultValue ?? roles[roles.length - 1]} className={`${fieldClass} mt-1.5`}>
      {roles.map((role) => (
        <option key={role} value={role}>
          {ROLE_LABEL[role]}
        </option>
      ))}
    </select>
  );
}

export function InviteForm({ roles }: { roles: readonly RoleName[] }) {
  return (
    <ActionForm action={inviteUser} className="space-y-4">
      <Field label="Email" name="email" type="email" autoComplete="off" required maxLength={254} />
      <div>
        <label htmlFor="invite-role" className="text-sm font-medium">
          Role
        </label>
        <RoleSelect id="invite-role" roles={roles} />
      </div>
      <SubmitButton pendingLabel="Sending...">Send invitation</SubmitButton>
    </ActionForm>
  );
}

export function CreateUserForm({ roles }: { roles: readonly RoleName[] }) {
  return (
    <ActionForm action={createUser} className="space-y-4">
      <Field label="Name" name="name" autoComplete="off" maxLength={80} />
      <Field label="Email" name="email" type="email" autoComplete="off" required maxLength={254} />
      <Field
        label="Temporary password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        maxLength={128}
        hint="At least 12 characters. The user must replace it at first sign-in."
      />
      <div>
        <label htmlFor="create-role" className="text-sm font-medium">
          Role
        </label>
        <RoleSelect id="create-role" roles={roles} />
      </div>
      <SubmitButton pendingLabel="Creating...">Create user</SubmitButton>
    </ActionForm>
  );
}

export function CancelInviteForm({ inviteId }: { inviteId: string }) {
  return (
    <ActionForm action={revokeInvite} showMessage={false}>
      <input type="hidden" name="inviteId" value={inviteId} />
      <SubmitButton variant="smallDanger" pendingLabel="Cancelling...">
        Cancel
      </SubmitButton>
    </ActionForm>
  );
}

export interface RowCapabilities {
  roles: readonly RoleName[];
  canDisable: boolean;
  canReset: boolean;
  canDelete: boolean;
}

/** The actions one row offers, behind a disclosure so the table stays readable. */
export function UserActions({
  user,
  can,
}: {
  user: { id: string; email: string; role: RoleName; disabled: boolean };
  can: RowCapabilities;
}) {
  const nothing = can.roles.length === 0 && !can.canDisable && !can.canReset && !can.canDelete;
  if (nothing) return <span className="text-xs text-muted-foreground">No actions</span>;

  return (
    <details className="group">
      <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-md border border-input px-3 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        Manage
      </summary>
      <div className="mt-3 w-64 space-y-4 rounded-md border border-border bg-background p-3">
        {can.roles.length > 0 ? (
          <ActionForm action={changeRole} showMessage={false} className="flex items-end gap-2">
            <input type="hidden" name="userId" value={user.id} />
            <div className="flex-1">
              <label htmlFor={`role-${user.id}`} className="text-xs font-medium">
                Role
              </label>
              <RoleSelect id={`role-${user.id}`} roles={can.roles} defaultValue={user.role} />
            </div>
            <SubmitButton variant="small" pendingLabel="Saving...">
              Save
            </SubmitButton>
          </ActionForm>
        ) : null}

        {can.canReset ? (
          <ActionForm action={sendReset} showMessage={false}>
            <input type="hidden" name="userId" value={user.id} />
            <SubmitButton variant="small" pendingLabel="Sending...">
              Email a reset link
            </SubmitButton>
          </ActionForm>
        ) : null}

        {can.canDisable ? (
          <ActionForm action={setDisabled} showMessage={false}>
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="disabled" value={user.disabled ? "false" : "true"} />
            <SubmitButton variant={user.disabled ? "small" : "smallDanger"} pendingLabel="Working...">
              {user.disabled ? "Enable account" : "Disable and sign out"}
            </SubmitButton>
          </ActionForm>
        ) : null}

        {can.canDelete ? (
          <ActionForm action={deleteUser} showMessage={false} className="space-y-2 border-t border-border pt-3">
            <input type="hidden" name="userId" value={user.id} />
            <Field label="Type the email to delete" name="confirm" autoComplete="off" placeholder={user.email} className="text-xs" />
            <SubmitButton variant="smallDanger" pendingLabel="Deleting...">
              Delete user
            </SubmitButton>
          </ActionForm>
        ) : null}
      </div>
    </details>
  );
}
