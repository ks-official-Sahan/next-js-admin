import Icon from "@/components/icons/Icon";
import { signOutAction } from "@/lib/actions/auth";

export interface UserMenuUser {
  name: string | null;
  email: string;
  role: string;
}

const ROLE_LABEL: Record<string, string> = {
  DEVELOPER: "Developer",
  SUPER_ADMIN: "Super admin",
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
          className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm s480:px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon name="logout" className="size-3.5" />
          <span className="sr-only s480:not-sr-only">Sign out</span>
        </button>
      </form>
    </div>
  );
}
