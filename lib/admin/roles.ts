import type { RoleName } from "@/lib/auth/permissions";

export const ROLE_LABEL: Record<RoleName, string> = {
  DEVELOPER: "Developer",
  SUPER_ADMIN: "Super admin",
  MANAGER: "Manager",
  EDITOR: "Editor",
};
