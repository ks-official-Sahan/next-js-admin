import type { ReactNode } from "react";

import Toaster from "@/components/admin/ui/Toaster";
import { navFor } from "@/lib/admin/nav";
import type { Permission } from "@/lib/auth/permissions";

import type { NavSectionView } from "./Nav";
import SessionHeartbeat from "./SessionHeartbeat";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import type { UserMenuUser } from "./UserMenu";

// Icons cross the server to client boundary as rendered elements, so the client
// nav never imports the icon set or the full nav config.
function toView(permissions: readonly Permission[]): NavSectionView[] {
  return navFor(permissions).map((section) => ({
    id: section.id,
    label: section.label,
    items: section.items.map(({ href, label, icon: Icon }) => ({
      href,
      label,
      icon: <Icon aria-hidden="true" className="size-4 shrink-0" />,
    })),
  }));
}

/**
 * Frame of every signed-in admin page: skip link, sidebar, top bar, main
 * landmark, session heartbeat and toasts. It receives the permissions of the
 * current user and shows only the links they may use.
 */
export default function AdminShell({
  permissions,
  user,
  children,
}: {
  permissions: readonly Permission[];
  user: UserMenuUser;
  children: ReactNode;
}) {
  const sections = toView(permissions);

  return (
    <div className="admin-root flex min-h-dvh bg-background text-foreground">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-foreground focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-background focus:outline-none"
      >
        Skip to content
      </a>
      <Sidebar sections={sections} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar sections={sections} user={user} />
        <main id="admin-main" tabIndex={-1} className="flex-1 px-4 py-6 outline-none s768:px-8 s768:py-8">
          {children}
        </main>
      </div>
      <SessionHeartbeat />
      <Toaster />
    </div>
  );
}
