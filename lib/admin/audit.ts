import "server-only";

import type { Prisma } from "@prisma/client";
import { headers } from "next/headers";

import type { AuditEvent } from "@sahan-sac/auth-kit";
import { clientIp, UNKNOWN_IP } from "@sahan-sac/auth-kit/security";

import { db } from "@/lib/db/prisma";
import { AUDIT_SENSITIVE_KEY, log, redact as redactValue } from "@/lib/log";

// The one writer for the audit trail (design notes, section 6.9).
// Action names use domain.entity.verb, for example auth.login.success.

export type { AuditEvent };

export interface AuditClient {
  auditLog: {
    create(args: { data: Prisma.AuditLogUncheckedCreateInput }): Promise<unknown>;
  };
}

/** Removes password, token, secret, hash, code and similar values from a payload. */
export function redact(value: unknown): unknown {
  return redactValue(value, AUDIT_SENSITIVE_KEY);
}

function json(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return redact(value) as Prisma.InputJsonValue;
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

export interface AuditManyClient {
  auditLog: {
    createMany(args: { data: Prisma.AuditLogCreateManyInput[] }): Promise<unknown>;
  };
}

function row(event: AuditEvent, context: { ip?: string; userAgent?: string }): Prisma.AuditLogUncheckedCreateInput {
  return {
    action: event.action,
    actorId: event.actor?.id ?? null,
    actorEmail: event.actor?.email ?? null,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    before: json(event.before),
    after: json(event.after),
    meta: json(event.meta),
    ip: event.ip ?? context.ip ?? null,
    userAgent: (event.userAgent ?? context.userAgent ?? null)?.slice(0, 512) ?? null,
  };
}

/** Writes one row. Throws when the write fails. */
export async function audit(event: AuditEvent, client: AuditClient = db): Promise<void> {
  const context = event.ip || event.userAgent ? {} : await requestContext();
  await client.auditLog.create({ data: row(event, context) });
}

/**
 * Writes one row per event in a single insert, for bulk actions: inside an
 * interactive transaction one round trip per row would add up fast (and can
 * outrun the transaction timeout). Throws when the write fails.
 */
export async function auditMany(events: AuditEvent[], client: AuditManyClient = db): Promise<void> {
  if (events.length === 0) return;
  const context = await requestContext();
  await client.auditLog.createMany({ data: events.map((event) => row(event, context)) });
}

/**
 * For sign-in and sign-out, where a failed audit write must not turn a working
 * login into an outage. The failure itself is logged.
 */
export async function auditSafe(event: AuditEvent, client?: AuditClient): Promise<void> {
  try {
    await audit(event, client);
  } catch (error) {
    log.error("audit write failed", { action: event.action, error: (error as Error).message });
  }
}
