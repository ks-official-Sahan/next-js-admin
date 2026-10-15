import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PurgeTrashForm, RestoreTrashForm } from "@/components/admin/trash/TrashForms";
import EmptyState from "@/components/admin/ui/EmptyState";
import { cardClass, tableClass } from "@/components/admin/ui/styles";
import { formatDateTime, relativeTime } from "@/lib/admin/format";
import { hasPermission, requireUser } from "@/lib/auth/dal";
import { repos } from "@/lib/data";
import { daysLeft, TRASH_DAYS, TRASH_ENTITIES, TRASH_LABEL, TRASH_PERMISSION } from "@/lib/trash/policy";

export const metadata: Metadata = { title: "Trash" };

/** The trash is small by design (TRASH_DAYS); one bounded read covers it. */
const TRASH_SHOWN = 200;

// Read outside the component: a server render is one request, and this is its clock.
const clock = () => Date.now();

export default async function TrashPage() {
  const actor = await requireUser();
  const mine = new Set(TRASH_ENTITIES.filter((entity) => hasPermission(actor, TRASH_PERMISSION[entity])));
  if (mine.size === 0) notFound();

  const nowMs = clock();
  const items = (await repos.trash.list(TRASH_SHOWN)).filter((item) => mine.has(item.entityType));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Trash</h1>
        <p className="text-sm text-muted-foreground">
          Deleted posts, media and works entries stay here for {TRASH_DAYS} days, then go for good. Restore puts an item back as it was.
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState title="The trash is empty" description="Items you delete show up here." />
      ) : (
        <div className={`${cardClass} overflow-x-auto p-0`}>
          <table className={tableClass}>
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Item</th>
                <th scope="col" className="px-4 py-3 font-medium">Type</th>
                <th scope="col" className="px-4 py-3 font-medium">Deleted</th>
                <th scope="col" className="px-4 py-3 font-medium">Goes in</th>
                <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const left = daysLeft(item.deletedAt, nowMs);
                return (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="max-w-xs truncate px-4 py-3 font-medium" title={item.label}>{item.label}</td>
                    <td className="px-4 py-3">{TRASH_LABEL[item.entityType]}</td>
                    <td className="px-4 py-3" title={formatDateTime(item.deletedAt)}>{relativeTime(item.deletedAt, nowMs)}</td>
                    <td className="px-4 py-3">{left === 1 ? "1 day" : `${left} days`}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <RestoreTrashForm id={item.id} />
                        <PurgeTrashForm id={item.id} label={item.label} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
