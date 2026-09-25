import Link from "next/link";

import { ADMIN_HOME } from "@/lib/admin/active";
import { Site } from "@/config/site";

import Nav, { type NavSectionView } from "./Nav";

/** Fixed sidebar for widths from 1024px up. Smaller screens use MobileNav. */
export default function Sidebar({ sections }: { sections: NavSectionView[] }) {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-card lg:block">
      <div className="sticky top-0 flex h-dvh flex-col gap-6 overflow-y-auto p-4">
        <Link
          href={ADMIN_HOME}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {Site.siteName}
          <span className="rounded bg-[#91FF00] px-1.5 py-0.5 text-[11px] font-semibold leading-none text-black">
            Admin
          </span>
        </Link>
        <Nav sections={sections} />
      </div>
    </aside>
  );
}
