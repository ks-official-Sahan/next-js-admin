"use server";

import { z } from "zod";

import { audit } from "@/lib/admin/audit";
import { authorizeAction } from "@/lib/actions/guard";
import { done, fail, fieldErrorsFrom, formValues, type ActionState } from "@/lib/actions/state";
import { roleCan } from "@/lib/auth/rbac";
import { repos, withTx } from "@/lib/data";
import { log } from "@/lib/log";

const LEADS_PATH = "/admin/leads";

const statusEnum = z.enum(["NEW", "CONTACTED", "CLOSED", "SPAM"], {
  message: "Choose a valid status.",
});

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function changeInquiryStatus(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const access = await authorizeAction("manageLeads");
  if (!access.ok) return fail(access.error);
  const { user: actor } = access;

  const parsed = z
    .object({
      inquiryId: z.string().min(1, "Inquiry ID is required."),
      status: statusEnum,
    })
    .safeParse(formValues(formData));

  if (!parsed.success) {
    return fail("Check the form.", fieldErrorsFrom(parsed.error.issues));
  }

  try {
    const inquiry = await repos.inquiries.findById(parsed.data.inquiryId);

    if (!inquiry) {
      return fail("Inquiry not found.");
    }

    await withTx(async (tx) => {
      const updated = await tx.inquiries.update(inquiry.id, { status: parsed.data.status });

      await audit(
        {
          action: "inquiry.status_changed",
          actor,
          entityType: "Inquiry",
          entityId: inquiry.id,
          before: { status: inquiry.status },
          after: { status: updated.status },
        },
        tx
      );
    });

    return done("Status updated.");
  } catch (error) {
    log.error("Failed to update inquiry status", { error: errorMessage(error) });
    return fail("Something went wrong. Nothing was changed.");
  }
}

export async function addInquiryNote(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const access = await authorizeAction("manageLeads");
  if (!access.ok) return fail(access.error);
  const { user: actor } = access;

  const parsed = z
    .object({
      inquiryId: z.string().min(1, "Inquiry ID is required."),
      note: z.string().max(5000, "Notes must be under 5000 characters."),
    })
    .safeParse(formValues(formData));

  if (!parsed.success) {
    return fail("Check the form.", fieldErrorsFrom(parsed.error.issues));
  }

  try {
    const inquiry = await repos.inquiries.findById(parsed.data.inquiryId);

    if (!inquiry) {
      return fail("Inquiry not found.");
    }

    await withTx(async (tx) => {
      const updated = await tx.inquiries.update(inquiry.id, { notes: parsed.data.note || null });

      await audit(
        {
          action: "inquiry.note_added",
          actor,
          entityType: "Inquiry",
          entityId: inquiry.id,
          before: { notes: inquiry.notes },
          after: { notes: updated.notes },
        },
        tx
      );
    });

    return done("Note saved.");
  } catch (error) {
    log.error("Failed to add inquiry note", { error: errorMessage(error) });
    return fail("Something went wrong. Nothing was changed.");
  }
}

/**
 * An inquiry may only be assigned to a user who exists, is not disabled, and
 * whose role currently holds `manageLeads` in the live role matrix — an
 * inquiry assigned to someone who cannot manage leads would be invisible to
 * them on the leads screen (which itself gates on that permission).
 */
async function checkAssignee(assigneeId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const assignee = await repos.users.findAccessState(assigneeId);
  if (!assignee) return { ok: false, error: "Assignee not found." };
  if (assignee.disabledAt) return { ok: false, error: "That user's account is disabled." };
  if (!(await roleCan(assignee.role, "manageLeads"))) {
    return { ok: false, error: "That user's role cannot manage leads." };
  }
  return { ok: true };
}

export async function assignInquiry(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const access = await authorizeAction("manageLeads");
  if (!access.ok) return fail(access.error);
  const { user: actor } = access;

  const parsed = z
    .object({
      inquiryId: z.string().min(1, "Inquiry ID is required."),
      assigneeId: z.string().optional(),
    })
    .safeParse(formValues(formData));

  if (!parsed.success) {
    return fail("Check the form.", fieldErrorsFrom(parsed.error.issues));
  }

  try {
    const inquiry = await repos.inquiries.findById(parsed.data.inquiryId);

    if (!inquiry) {
      return fail("Inquiry not found.");
    }

    if (parsed.data.assigneeId) {
      const checked = await checkAssignee(parsed.data.assigneeId);
      if (!checked.ok) return fail(checked.error);
    }

    await withTx(async (tx) => {
      const updated = await tx.inquiries.update(inquiry.id, { assigneeId: parsed.data.assigneeId || null });

      await audit(
        {
          action: "inquiry.assigned",
          actor,
          entityType: "Inquiry",
          entityId: inquiry.id,
          before: { assigneeId: inquiry.assigneeId },
          after: { assigneeId: updated.assigneeId },
        },
        tx
      );
    });

    return done("Assignee updated.");
  } catch (error) {
    log.error("Failed to assign inquiry", { error: errorMessage(error) });
    return fail("Something went wrong. Nothing was changed.");
  }
}

export async function deleteInquiry(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const access = await authorizeAction("manageLeads");
  if (!access.ok) return fail(access.error);
  const { user: actor } = access;

  const inquiryId = formData.get("inquiryId");
  if (typeof inquiryId !== "string" || !inquiryId) {
    return fail("Inquiry ID is required.");
  }

  try {
    const inquiry = await repos.inquiries.findById(inquiryId);

    if (!inquiry) {
      return fail("Inquiry not found.");
    }

    await withTx(async (tx) => {
      await tx.inquiries.delete(inquiry.id);

      await audit(
        {
          action: "inquiry.deleted",
          actor,
          entityType: "Inquiry",
          entityId: inquiry.id,
          before: { name: inquiry.name, email: inquiry.email },
        },
        tx
      );
    });

    return done("Inquiry deleted.");
  } catch (error) {
    log.error("Failed to delete inquiry", { error: errorMessage(error) });
    return fail("Something went wrong. Nothing was changed.");
  }
}
