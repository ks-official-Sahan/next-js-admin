"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";

import { createUser, inviteUser, regenerateInviteLink, revokeInvite } from "@/lib/actions/users";
import type { ActionState } from "@/lib/actions/state";
import ActionForm, { ConfirmSubmitButton, Field, SubmitButton, useActionResult } from "@/components/admin/ui/ActionForm";
import CopyField from "@/components/admin/ui/CopyField";
import { PasswordField } from "@/components/admin/ui/PasswordField";
import { fieldClass } from "@/components/admin/ui/styles";
import { ROLE_LABEL } from "@/lib/admin/roles";
import type { RoleName } from "@/lib/auth/permissions";

export function RoleSelect({
  roles,
  defaultValue,
  id,
  name = "role",
}: {
  roles: readonly RoleName[];
  defaultValue?: RoleName;
  id: string;
  name?: string;
}) {
  return (
    <select id={id} name={name} defaultValue={defaultValue ?? roles[roles.length - 1]} className={`${fieldClass} mt-1.5`}>
      {roles.map((role) => (
        <option key={role} value={role}>
          {ROLE_LABEL[role]}
        </option>
      ))}
    </select>
  );
}

/** The link from the last invitation this form made; the server returns it once. */
function InviteLinkResult() {
  const { link } = useActionResult();
  if (!link) return null;
  return (
    <CopyField
      value={link}
      label="Invitation link"
      hint="Works once and lasts 72 hours. Anyone with it can create this account, so share it only with them."
      autoCopy
      className="rounded-md border border-border bg-muted/30 p-3"
    />
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
      <label className="flex items-start gap-2 text-sm">
        {/* Unchecked boxes send nothing: the hidden 0 makes "off" explicit. */}
        <input type="hidden" name="notify" value="0" />
        <input type="checkbox" name="notify" value="1" defaultChecked className="mt-0.5 size-4 accent-primary" />
        <span>
          Email the invitation
          <span className="block text-xs text-muted-foreground">Turn off to only create a link and share it yourself.</span>
        </span>
      </label>
      <SubmitButton pendingLabel="Creating...">Create invitation</SubmitButton>
      <InviteLinkResult />
    </ActionForm>
  );
}

export function CreateUserForm({ roles }: { roles: readonly RoleName[] }) {
  return (
    <ActionForm action={createUser} className="space-y-4">
      <Field label="Name" name="name" autoComplete="off" maxLength={80} />
      <Field label="Email" name="email" type="email" autoComplete="off" required maxLength={254} />
      <PasswordField
        label="Temporary password"
        name="password"
        autoComplete="new-password"
        required
        maxLength={128}
        hint="At least 12 characters. The user must replace it at first sign-in."
        generate
      />
      <div>
        <label htmlFor="create-role" className="text-sm font-medium">
          Role
        </label>
        <RoleSelect id="create-role" roles={roles} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="hidden" name="notify" value="0" />
        <input type="checkbox" name="notify" value="1" defaultChecked className="mt-0.5 size-4 accent-primary" />
        <span>
          Email them a sign-in link
          <span className="block text-xs text-muted-foreground">The password is never emailed: share it another way.</span>
        </span>
      </label>
      <SubmitButton pendingLabel="Creating...">Create user</SubmitButton>
    </ActionForm>
  );
}

/** Actions for one open invitation: a fresh link to copy (the old one stops working), or cancel it. */
export function InviteRowActions({ inviteId, email }: { inviteId: string; email: string }) {
  const [link, setLink] = useState<string | null>(null);
  const onResult = (state: ActionState) => {
    if (state.ok && state.link) setLink(state.link);
  };
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <ActionForm action={regenerateInviteLink} showMessage={false} onResult={onResult}>
          <input type="hidden" name="inviteId" value={inviteId} />
          <ConfirmSubmitButton
            variant="small"
            pendingLabel="Making..."
            confirmMessage={`Make a new link for ${email}? The link already sent stops working.`}
          >
            <Link2 aria-hidden className="size-3.5" />
            New link
          </ConfirmSubmitButton>
        </ActionForm>
        <ActionForm action={revokeInvite} showMessage={false}>
          <input type="hidden" name="inviteId" value={inviteId} />
          <ConfirmSubmitButton variant="smallDanger" pendingLabel="Cancelling..." confirmMessage={`Cancel the invitation for ${email}?`}>
            Cancel
          </ConfirmSubmitButton>
        </ActionForm>
      </div>
      {link ? (
        <CopyField value={link} label={`New link for ${email}`} hint="The previous link no longer works." autoCopy className="w-full min-w-64 text-left" />
      ) : null}
    </div>
  );
}
