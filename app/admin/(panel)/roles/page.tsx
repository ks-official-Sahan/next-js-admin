import type { Metadata } from "next";

import MatrixForm, { type MatrixGroup } from "@/components/admin/roles/MatrixForm";
import { requirePermission } from "@/lib/auth/dal";
import { NEVER_GRANTABLE, PERMISSIONS, PERMISSION_INFO } from "@/lib/auth/permissions";
import { loadMatrix } from "@/lib/auth/rbac";

export const metadata: Metadata = { title: "Roles and permissions" };

export default async function RolesPage() {
  await requirePermission("managePermissions");
  const matrix = await loadMatrix();

  const groups: MatrixGroup[] = [];
  for (const permission of PERMISSIONS) {
    const info = PERMISSION_INFO[permission];
    let group = groups.find((entry) => entry.group === info.group);
    if (!group) groups.push((group = { group: info.group, items: [] }));
    group.items.push({
      permission,
      label: info.label,
      description: info.description,
      manager: matrix.MANAGER.has(permission),
      editor: matrix.EDITOR.has(permission),
      locked: NEVER_GRANTABLE.includes(permission),
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Roles and permissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What each role can do. A developer always holds every permission, so a wrong edit here cannot lock the
          owner out. Changes apply at once and are written to the audit log.
        </p>
      </div>
      <MatrixForm groups={groups} />
    </div>
  );
}
