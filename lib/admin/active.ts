// Kept apart from nav.ts so the client nav can import it without pulling the
// whole nav config (labels, links, icons) into the browser bundle.

export const ADMIN_HOME = "/admin";

/** Active state of a nav link: exact for the dashboard, prefix for sections. */
export function isActive(pathname: string, href: string): boolean {
  if (href === ADMIN_HOME) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
