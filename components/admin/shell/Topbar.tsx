import { ExternalLink } from "lucide-react";

import MobileNav from "./MobileNav";
import type { NavSectionView } from "./Nav";
import ThemeToggle from "./ThemeToggle";
import UserMenu, { type UserMenuUser } from "./UserMenu";

/** Sticky top bar: drawer button on small screens, link to the site, theme, user. */
export default function Topbar({
  sections,
  user,
}: {
  sections: NavSectionView[];
  user: UserMenuUser;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 s768:px-6">
      <MobileNav sections={sections} />
      <div className="flex-1" />
      <a
        href="/"
        target="_blank"
        rel="noopener"
        className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        View site
        <ExternalLink aria-hidden="true" className="size-3.5" />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
      <ThemeToggle />
      <UserMenu user={user} />
    </header>
  );
}
