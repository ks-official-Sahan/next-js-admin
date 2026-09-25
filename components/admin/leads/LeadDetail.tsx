"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { Inquiry, InquiryEmailEvent } from "@prisma/client";

import { changeInquiryStatus, addInquiryNote } from "@/lib/actions/leads";
import { badgeClass, buttonVariants, cardClass, fieldClass, textareaClass } from "@/components/admin/ui/styles";

interface LeadDetailProps {
  inquiry: Inquiry & {
    assignee?: { id: string; name: string | null; email: string } | null;
    events?: InquiryEmailEvent[];
  };
}

// A neutral badge matches every other admin list; SPAM alone gets a
// destructive tint so it still stands out at a glance.
const spamBadgeClass =
  "inline-flex items-center rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive";

export function LeadDetail({ inquiry }: LeadDetailProps) {
  const [statusState, statusAction] = useActionState(changeInquiryStatus, {
    ok: false,
    message: null,
    error: null,
  });
  const [noteState, noteAction] = useActionState(addInquiryNote, {
    ok: false,
    message: null,
    error: null,
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{inquiry.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{inquiry.email}</p>
        </div>
        <Link href="/admin/leads" className={buttonVariants.secondary}>
          Back to list
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 s768:grid-cols-3">
        {/* Contact Info */}
        <div className={cardClass}>
          <div className="space-y-3">
            <div>
              <div className="text-sm font-semibold text-muted-foreground">Email</div>
              <div className="text-sm">{inquiry.email}</div>
            </div>
            {inquiry.phone && (
              <div>
                <div className="text-sm font-semibold text-muted-foreground">Phone</div>
                <div className="text-sm">{inquiry.phone}</div>
              </div>
            )}
            {inquiry.topic && (
              <div>
                <div className="text-sm font-semibold text-muted-foreground">Topic</div>
                <div className="text-sm">{inquiry.topic}</div>
              </div>
            )}
            <div>
              <div className="text-sm font-semibold text-muted-foreground">Received</div>
              <div className="text-sm">{inquiry.createdAt.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Status & Spam */}
        <div className={cardClass}>
          <div className="space-y-3">
            <div>
              <div className="mb-2 text-sm font-semibold text-muted-foreground">Status</div>
              <form action={statusAction} className="flex gap-2">
                <input type="hidden" name="inquiryId" value={inquiry.id} />
                <select
                  name="status"
                  defaultValue={inquiry.status}
                  onChange={(e) => {
                    const formData = new FormData();
                    formData.set("inquiryId", inquiry.id);
                    formData.set("status", e.target.value);
                    statusAction(formData);
                  }}
                  className={`${fieldClass} h-9 flex-1`}
                >
                  <option value="NEW">New</option>
                  <option value="CONTACTED">Contacted</option>
                  <option value="CLOSED">Closed</option>
                  <option value="SPAM">Spam</option>
                </select>
              </form>
              {statusState.error && <p className="mt-1 text-xs text-destructive">{statusState.error}</p>}
            </div>
            <div>
              <div className="mb-2 text-sm font-semibold text-muted-foreground">Spam Score</div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-32 flex-1 overflow-hidden rounded bg-muted">
                  <div className="h-full bg-destructive" style={{ width: `${Math.min(inquiry.spamScore, 100)}%` }} />
                </div>
                <div className="font-mono text-sm">{inquiry.spamScore}/100</div>
              </div>
            </div>
            <div>
              <span className={inquiry.status === "SPAM" ? spamBadgeClass : badgeClass}>{inquiry.status}</span>
            </div>
          </div>
        </div>

        {/* Meta Info */}
        <div className={cardClass}>
          <div className="space-y-3 text-sm">
            <div>
              <div className="font-semibold text-muted-foreground">Source</div>
              <div className="capitalize">{inquiry.source}</div>
            </div>
            {inquiry.userAgent && (
              <div>
                <div className="font-semibold text-muted-foreground">User Agent</div>
                <div className="truncate text-xs">{inquiry.userAgent}</div>
              </div>
            )}
            {inquiry.pagePath && (
              <div>
                <div className="font-semibold text-muted-foreground">Page</div>
                <div className="truncate text-xs">{inquiry.pagePath}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Message */}
      <div className={cardClass}>
        <h2 className="mb-2 text-base font-medium">Message</h2>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{inquiry.message}</p>
      </div>

      {/* Notes */}
      <div className={cardClass}>
        <h2 className="mb-3 text-base font-medium">Notes</h2>
        <form action={noteAction} className="space-y-2">
          <input type="hidden" name="inquiryId" value={inquiry.id} />
          <textarea
            name="note"
            defaultValue={inquiry.notes || ""}
            placeholder="Add internal notes..."
            className={textareaClass}
          />
          <button type="submit" className={buttonVariants.primary}>
            Save Notes
          </button>
          {noteState.error && <p className="text-sm text-destructive">{noteState.error}</p>}
          {noteState.message && <p className="text-sm text-muted-foreground">{noteState.message}</p>}
        </form>
      </div>

      {/* Email Events */}
      {inquiry.events && inquiry.events.length > 0 && (
        <div className={cardClass}>
          <h2 className="mb-3 text-base font-medium">Email History</h2>
          <div className="space-y-2">
            {inquiry.events.map((event) => (
              <div
                key={event.id}
                className={`rounded-md border p-3 text-sm ${
                  event.ok ? "border-border bg-muted/40" : "border-destructive/40 bg-destructive/10"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className={`font-semibold capitalize ${event.ok ? "" : "text-destructive"}`}>
                      {event.kind} {event.ok ? "✓" : "✗"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {event.provider} • {event.createdAt.toLocaleString()}
                    </div>
                  </div>
                  {event.error && <div className="text-xs text-destructive">{event.error}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
