import type { Metadata } from "next";

import MatrixForm, { type MatrixGroup } from "@/components/admin/roles/MatrixForm";
import RolesManager from "@/components/admin/roles/RolesManager";
import { requirePermission } from "@/lib/auth/dal";
import { getDeveloperMask } from "@/lib/auth/mask";
import { NEVER_GRANTABLE, PERMISSIONS, PERMISSION_INFO, SUPER_ROLE, isFixedRole } from "@/lib/auth/permissions";
import { loadMatrix } from "@/lib/auth/rbac";
import { getRoleCatalog } from "@/lib/auth/roles";
import { repos } from "@/lib/data";

export const metadata: Metadata = { title: "Roles and permissions" };

export default async function RolesPage() {
  const actor = await requirePermission("managePermissions");
  const [catalog, matrix, userCounts, mask] = await Promise.all([getRoleCatalog(), loadMatrix(), repos.roles.userCounts(), getDeveloperMask()]);

  // The roles as this viewer may see them (lib/auth/mask.ts), and what they
  // may change: only roles ranked below their own (every role, for a
  // developer), never a role fixed in code, and only permissions they hold.
  const shown = mask.visibleRoles(actor, catalog.roles, mask.unmaskedCount);
  const counts = mask.presentCounts(actor, userCounts, mask.maskedCount);
  const editable = new Set(catalog.assignable(actor.role));
  const superShown = shown.some((role) => role.name === SUPER_ROLE);
  const columns = shown.filter((role) => role.name !== SUPER_ROLE);
  const holds = new Set(actor.permissions);

  const groups: MatrixGroup[] = [];
  for (const permission of PERMISSIONS) {
    const info = PERMISSION_INFO[permission];
    let group = groups.find((entry) => entry.group === info.group);
    if (!group) groups.push((group = { group: info.group, items: [] }));
    group.items.push({
      permission,
      label: info.label,
      description: info.description,
      granted: columns.filter((role) => matrix[role.name]?.has(permission)).map((role) => role.name),
      locked: NEVER_GRANTABLE.includes(permission) || !holds.has(permission),
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Roles and permissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Who exists and what each role can do. The top roles hold fixed permissions, so a wrong edit here cannot lock the
          owner out. Changes apply within a minute and are written to the audit log.
        </p>
      </div>

      <section aria-labelledby="roles-heading" className="space-y-3">
        <h2 id="roles-heading" className="text-base font-medium">
          Roles
        </h2>
        <RolesManager
          roles={shown.map((role) => ({ ...role, users: counts[role.name] ?? 0, editable: editable.has(role.name) }))}
          superRole={superShown ? SUPER_ROLE : null}
        />
      </section>

      <section aria-labelledby="matrix-heading" className="space-y-3">
        <h2 id="matrix-heading" className="text-base font-medium">
          Permissions
        </h2>
        <MatrixForm
          superLabel={superShown ? (catalog.get(SUPER_ROLE)?.label ?? "Developer") : null}
          roles={columns.map((role) => ({ name: role.name, label: role.label, locked: isFixedRole(role.name) || !editable.has(role.name) }))}
          groups={groups}
        />
      </section>
    </div>
  );
}
