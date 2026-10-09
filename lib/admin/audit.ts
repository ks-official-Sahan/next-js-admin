import "server-only";

import { headers } from "next/headers";

import type { AuditEvent } from "@sahan-sac/auth-kit";
import { clientIp, UNKNOWN_IP } from "@sahan-sac/auth-kit/security";

import { repos, type Repos } from "@/lib/data";
import type { AuditRow } from "@/lib/data/audit";
import { AUDIT_SENSITIVE_KEY, log, redact as redactValue } from "@/lib/log";

// The one writer for the audit trail (design notes, section 6.9).
// Action names use domain.entity.verb, for example auth.login.success.

export type { AuditEvent };

/** Where an audit row goes: the repositories (shared, or one transaction's from withTx). */
export type AuditTarget = Pick<Repos, "audit">;

/** Removes password, token, secret, hash, code and similar values from a payload. */
export function redact(value: unknown): unknown {
  return redactValue(value, AUDIT_SENSITIVE_KEY);
}

function json(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  return redact(value);
}

async function requestContext(): Promise<{ ip?: string; userAgent?: string }> {
  try {
    const h = await headers();
    const ip = clientIp(h);
    return {
      ip: ip === UNKNOWN_IP ? undefined : ip,
      userAgent: h.get("user-agent") ?? undefined,
    };
  } catch {
    // Outside a request (a script or a test) there are no headers.
    return {};
  }
}

export type AuditManyTarget = Pick<Repos, "audit">;

function row(event: AuditEvent, context: { ip?: string; userAgent?: string }, actorRole: string | null): AuditRow {
  return {
    action: event.action,
    actorId: event.actor?.id ?? null,
    actorEmail: event.actor?.email ?? null,
    actorRole,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    before: json(event.before),
    after: json(event.after),
    meta: json(event.meta),
    ip: event.ip ?? context.ip ?? null,
    userAgent: (event.userAgent ?? context.userAgent ?? null)?.slice(0, 512) ?? null,
  };
}

/** The email a row with no actor names, such as a failed sign-in's. */
function subjectEmail(event: AuditEvent): string | null {
  const email = (event.meta as { email?: unknown } | null | undefined)?.email;
  return typeof email === "string" && email.length > 0 ? email.toLowerCase() : null;
}

/**
 * The role kept on the row (audit_logs.actorRole), which decides who may read
 * it: the actor's, as the caller passed it or read from the account; for a
 * row with no actor, the role of the account it names by email. A lookup
 * that fails leaves it empty rather than failing the write.
 */
async function roleOf(event: AuditEvent): Promise<string | null> {
  if (event.actor?.role) return event.actor.role;
  const id = event.actor?.id;
  const email = id ? null : (event.actor?.email?.toLowerCase() ?? subjectEmail(event));
  if (!id && !email) return null;
  try {
    const user = id ? await repos.users.findRef(id) : await repos.users.findRefByEmail(email!);
    return user?.role ?? null;
  } catch {
    return null;
  }
}

/** Writes one row. Throws when the write fails. */
export async function audit(event: AuditEvent, client: AuditTarget = repos): Promise<void> {
  const [context, actorRole] = await Promise.all([event.ip || event.userAgent ? {} : requestContext(), roleOf(event)]);
  await client.audit.create(row(event, context, actorRole));
}

/**
 * Writes one row per event in a single insert, for bulk actions: inside an
 * interactive transaction one round trip per row would add up fast (and can
 * outrun the transaction timeout). Throws when the write fails.
 */
export async function auditMany(events: AuditEvent[], client: AuditManyTarget = repos): Promise<void> {
  if (events.length === 0) return;
  // One read for every actor whose role the caller left out, never one per row.
  const missing = [...new Set(events.filter((event) => !event.actor?.role && event.actor?.id).map((event) => event.actor!.id!))];
  const [context, found] = await Promise.all([requestContext(), missing.length > 0 ? repos.users.findRefs(missing).catch(() => []) : []]);
  const roles = new Map(found.map((user) => [user.id, user.role]));
  const rows = events.map((event) => row(event, context, event.actor?.role ?? roles.get(event.actor?.id ?? "") ?? null));
  await client.audit.createMany(rows);
}

/**
 * For sign-in and sign-out, where a failed audit write must not turn a working
 * login into an outage. The failure itself is logged.
 */
export async function auditSafe(event: AuditEvent, client?: AuditTarget): Promise<void> {
  try {
    await audit(event, client);
  } catch (error) {
    log.error("audit write failed", { action: event.action, error: (error as Error).message });
  }
}
