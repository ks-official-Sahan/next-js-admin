"use client";

import ActionForm, { SubmitButton } from "@/components/admin/ui/ActionForm";
import { saveMatrix } from "@/lib/actions/roles";

export interface MatrixRole {
  name: string;
  label: string;
  /** Fixed in code, or ranked at or above the viewer: shown, never edited. */
  locked: boolean;
}

export interface MatrixGroup {
  group: string;
  items: Array<{
    permission: string;
    label: string;
    description: string;
    /** Shown roles that hold it. */
    granted: string[];
    /** Never grantable in the matrix, or not held by the viewer: the boxes are locked. */
    locked: boolean;
  }>;
}

/**
 * The permission matrix, one column per role. The super role, when shown, is
 * ticked and locked: it always holds everything. A locked box is never sent,
 * and the save keeps what is stored for it. The permission column stays put
 * while a wide matrix scrolls sideways.
 */
export default function MatrixForm({ superLabel, roles, groups }: { superLabel: string | null; roles: MatrixRole[]; groups: MatrixGroup[] }) {
  const columns = roles.length + (superLabel ? 2 : 1);
  return (
    <ActionForm action={saveMatrix} className="space-y-6">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm" style={{ minWidth: `${20 + columns * 6}rem` }}>
          <thead className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-muted px-3 py-2">
                Permission
              </th>
              {superLabel ? (
                <th scope="col" className="w-24 px-3 py-2 text-center">
                  {superLabel}
                </th>
              ) : null}
              {roles.map((role) => (
                <th key={role.name} scope="col" className="w-24 px-3 py-2 text-center">
                  {role.label}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.group} className="divide-y divide-border border-b border-border last:border-b-0">
              <tr className="bg-muted/20">
                <th scope="colgroup" colSpan={columns} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
                  {group.group}
                </th>
              </tr>
              {group.items.map((item) => (
                <tr key={item.permission}>
                  <th scope="row" className="sticky left-0 z-10 bg-background px-3 py-2.5 text-left font-normal">
                    <div className="font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground">{item.description}</div>
                  </th>
                  {superLabel ? (
                    <td className="px-3 py-2.5 text-center">
                      <input type="checkbox" checked disabled aria-label={`${superLabel}: ${item.label}`} className="size-4" />
                    </td>
                  ) : null}
                  {roles.map((role) => (
                    <td key={role.name} className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        name={`perm:${role.name}:${item.permission}`}
                        defaultChecked={item.granted.includes(role.name)}
                        disabled={role.locked || item.locked}
                        aria-label={`${role.label}: ${item.label}`}
                        className="size-4 accent-primary"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <SubmitButton pendingLabel="Saving...">Save permissions</SubmitButton>
    </ActionForm>
  );
}
