import { LogOut } from "lucide-react";

import { signOutAction } from "@/lib/actions/auth";

export interface UserMenuUser {
  name: string | null;
  email: string;
  role: string;
}

const ROLE_LABEL: Record<string, string> = {
  DEVELOPER: "Developer",
  MANAGER: "Manager",
  EDITOR: "Editor",
};

/** Who is signed in, and the sign-out button (a form, so it works without script). */
export default function UserMenu({ user }: { user: UserMenuUser }) {
  return (
    <div className="flex items-center gap-2">
      <div className="hidden min-w-0 text-right s640:block">
        <p className="truncate text-sm font-medium leading-tight">{user.name ?? user.email}</p>
        <p className="truncate text-xs leading-tight text-muted-foreground">
          {ROLE_LABEL[user.role] ?? user.role}
        </p>
      </div>
      <form action={signOutAction}>
        <button
          type="submit"
          className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogOut aria-hidden="true" className="size-3.5" />
          Sign out
        </button>
      </form>
    </div>
  );
}
