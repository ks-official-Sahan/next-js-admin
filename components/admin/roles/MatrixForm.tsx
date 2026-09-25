"use client";

import ActionForm, { SubmitButton } from "@/components/admin/ui/ActionForm";
import { saveMatrix } from "@/lib/actions/roles";

export interface MatrixGroup {
  group: string;
  items: Array<{
    permission: string;
    label: string;
    description: string;
    manager: boolean;
    editor: boolean;
    /** Only a DEVELOPER can ever hold it, so the boxes are locked. */
    locked: boolean;
  }>;
}

/** The permission matrix. DEVELOPER is shown ticked and locked: it always holds everything. */
export default function MatrixForm({ groups }: { groups: MatrixGroup[] }) {
  return (
    <ActionForm action={saveMatrix} className="space-y-6">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2">Permission</th>
              <th scope="col" className="w-24 px-3 py-2 text-center">Developer</th>
              <th scope="col" className="w-24 px-3 py-2 text-center">Manager</th>
              <th scope="col" className="w-24 px-3 py-2 text-center">Editor</th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.group} className="divide-y divide-border border-b border-border last:border-b-0">
              <tr className="bg-muted/20">
                <th scope="colgroup" colSpan={4} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
                  {group.group}
                </th>
              </tr>
              {group.items.map((item) => (
                <tr key={item.permission}>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground">{item.description}</div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <input type="checkbox" checked disabled aria-label={`Developer: ${item.label}`} className="size-4" />
                  </td>
                  {(["manager", "editor"] as const).map((role) => (
                    <td key={role} className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        name={`perm:${role.toUpperCase()}:${item.permission}`}
                        defaultChecked={item[role] && !item.locked}
                        disabled={item.locked}
                        aria-label={`${role === "manager" ? "Manager" : "Editor"}: ${item.label}`}
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
