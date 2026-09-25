"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Inquiry } from "@prisma/client";

import { cn } from "@/lib/utils";
import { badgeClass, buttonVariants, fieldClass, tableClass, tdClass, thClass } from "@/components/admin/ui/styles";

// A neutral badge matches every other admin list (see users/sessions pages);
// SPAM alone gets a destructive tint so it still stands out at a glance.
const spamBadgeClass =
  "inline-flex items-center rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive";

interface LeadsListProps {
  inquiries: Inquiry[];
  total: number;
  page: number;
  totalPages: number;
  status?: string;
  search?: string;
}

export function LeadsList({ inquiries, total, page, totalPages, status, search }: LeadsListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set("page", "1");
    router.push(`/admin/leads?${params.toString()}`);
  };

  const goToPage = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(newPage));
    router.push(`/admin/leads?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={status || ""}
          onChange={(e) => updateFilter("status", e.target.value)}
          className={cn(fieldClass, "w-auto")}
        >
          <option value="">All statuses</option>
          <option value="NEW">New</option>
          <option value="CONTACTED">Contacted</option>
          <option value="CLOSED">Closed</option>
          <option value="SPAM">Spam</option>
        </select>

        <input
          type="text"
          placeholder="Search..."
          defaultValue={search}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              updateFilter("search", (e.target as HTMLInputElement).value);
            }
          }}
          className={cn(fieldClass, "min-w-[12rem] flex-1")}
        />

        <a href="/api/admin/export/leads" className={buttonVariants.secondary}>
          Export CSV
        </a>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className={tableClass}>
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th scope="col" className={thClass}>
                Name
              </th>
              <th scope="col" className={thClass}>
                Email
              </th>
              <th scope="col" className={thClass}>
                Topic
              </th>
              <th scope="col" className={thClass}>
                Status
              </th>
              <th scope="col" className={thClass}>
                Spam Score
              </th>
              <th scope="col" className={thClass}>
                Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {inquiries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No inquiries found
                </td>
              </tr>
            ) : (
              inquiries.map((inquiry) => (
                <tr key={inquiry.id} className="hover:bg-muted/40">
                  <td className={tdClass}>
                    <Link href={`/admin/leads/${inquiry.id}`} className="font-medium text-primary hover:underline">
                      {inquiry.name}
                    </Link>
                  </td>
                  <td className={`${tdClass} text-muted-foreground`}>{inquiry.email}</td>
                  <td className={tdClass}>{inquiry.topic || "-"}</td>
                  <td className={tdClass}>
                    <span className={inquiry.status === "SPAM" ? spamBadgeClass : badgeClass}>{inquiry.status}</span>
                  </td>
                  <td className={tdClass}>
                    <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-destructive"
                        style={{ width: `${Math.min(inquiry.spamScore, 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className={`${tdClass} text-xs text-muted-foreground`}>
                    {inquiry.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {inquiries.length === 0 ? 0 : (page - 1) * 50 + 1} to {Math.min(page * 50, total)} of {total}{" "}
          inquiries
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => goToPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className={buttonVariants.small}
          >
            Previous
          </button>
          <span className="px-3 py-2 text-sm">
            {page} of {totalPages}
          </span>
          <button
            onClick={() => goToPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className={buttonVariants.small}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
