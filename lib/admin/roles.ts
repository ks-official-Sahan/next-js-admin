import type { RoleName } from "@/lib/auth/permissions";

export const ROLE_LABEL: Record<RoleName, string> = {
  DEVELOPER: "Developer",
  MANAGER: "Manager",
  EDITOR: "Editor",
};
