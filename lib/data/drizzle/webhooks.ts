import { and, arrayContains, asc, desc, eq, inArray, lt, lte, ne, or, sql } from "drizzle-orm";

import { webhookDeliveries, webhookEndpoints } from "@/lib/db/schema";

import type { DeliveryJob, WebhookDeliveryView, WebhookRepo } from "../webhooks";
import { countRows, first, one, type DbClient } from "./client";

const ENDPOINT_VIEW = {
  id: webhookEndpoints.id,
  url: webhookEndpoints.url,
  description: webhookEndpoints.description,
  events: webhookEndpoints.events,
  active: webhookEndpoints.active,
  createdAt: webhookEndpoints.createdAt,
} as const;

const TARGET = {
  id: webhookEndpoints.id,
  url: webhookEndpoints.url,
  secretCipher: webhookEndpoints.secretCipher,
  active: webhookEndpoints.active,
} as const;

/** `events` is nullable in the column; Prisma's String[] default is empty, so null reads as []. */
const asEndpoint = <T extends { events: string[] | null }>(row: T) =>
  ({ ...row, events: row.events ?? [] }) as Omit<T, "events"> & { events: string[] };

export function webhookRepo(client: DbClient): WebhookRepo {
  return {
    async listEndpoints() {
      return (await client.select(ENDPOINT_VIEW).from(webhookEndpoints).orderBy(asc(webhookEndpoints.createdAt))).map(asEndpoint);
    },
    countEndpoints() {
      return countRows(client, webhookEndpoints);
    },
    async findEndpoint(id) {
      const row = first(
        await client
          .select({ ...ENDPOINT_VIEW, secretCipher: webhookEndpoints.secretCipher })
          .from(webhookEndpoints)
          .where(eq(webhookEndpoints.id, id))
          .limit(1)
      );
      return row && asEndpoint(row);
    },
    async createEndpoint(input) {
      return asEndpoint(one(await client.insert(webhookEndpoints).values(input).returning(ENDPOINT_VIEW), "Webhook endpoint"));
    },
    async updateEndpoint(id, input) {
      const row = first(await client.update(webhookEndpoints).set(input).where(eq(webhookEndpoints.id, id)).returning(ENDPOINT_VIEW));
      return row && asEndpoint(row);
    },
    async deleteEndpoint(id) {
      const deleted = await client.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id)).returning({ id: webhookEndpoints.id });
      return deleted.length === 1;
    },
    targetsFor(event) {
      return client
        .select(TARGET)
        .from(webhookEndpoints)
        .where(
          and(
            eq(webhookEndpoints.active, true),
            or(sql`cardinality(${webhookEndpoints.events}) = 0`, arrayContains(webhookEndpoints.events, [event]))
          )
        );
    },
    async enqueue(rows) {
      if (rows.length === 0) return [];
      const now = new Date();
      const created = await client
        .insert(webhookDeliveries)
        .values(rows.map((row) => ({ ...row, nextAttemptAt: now })))
        .returning({ id: webhookDeliveries.id });
      return created.map((row) => row.id);
    },
    async findJobs(ids) {
      if (ids.length === 0) return [];
      return (await client
        .select({
          id: webhookDeliveries.id,
          event: webhookDeliveries.event,
          payload: webhookDeliveries.payload,
          idempotencyKey: webhookDeliveries.idempotencyKey,
          status: webhookDeliveries.status,
          attempts: webhookDeliveries.attempts,
          endpoint: TARGET,
        })
        .from(webhookDeliveries)
        .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
        .where(inArray(webhookDeliveries.id, ids))) as DeliveryJob[];
    },
    async dueIds(now, take) {
      const rows = await client
        .select({ id: webhookDeliveries.id })
        .from(webhookDeliveries)
        .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
        .where(
          and(
            eq(webhookDeliveries.status, "PENDING"),
            lte(webhookDeliveries.nextAttemptAt, now),
            eq(webhookEndpoints.active, true)
          )
        )
        .orderBy(asc(webhookDeliveries.nextAttemptAt))
        .limit(take);
      return rows.map((row) => row.id);
    },
    async claim(id, attempts, leaseUntil) {
      const claimed = await client
        .update(webhookDeliveries)
        .set({ attempts: sql`${webhookDeliveries.attempts} + 1`, nextAttemptAt: leaseUntil })
        .where(and(eq(webhookDeliveries.id, id), eq(webhookDeliveries.attempts, attempts), eq(webhookDeliveries.status, "PENDING")))
        .returning({ id: webhookDeliveries.id });
      return claimed.length === 1;
    },
    async finish(id, outcome) {
      // Prisma's update throws when the row is missing; keep that contract.
      one(
        await client.update(webhookDeliveries).set(outcome).where(eq(webhookDeliveries.id, id)).returning({ id: webhookDeliveries.id }),
        "Webhook delivery"
      );
    },
    async requeue(id, now) {
      const requeued = await client
        .update(webhookDeliveries)
        .set({ status: "PENDING", nextAttemptAt: now })
        .where(and(eq(webhookDeliveries.id, id), ne(webhookDeliveries.status, "DELIVERED")))
        .returning({ id: webhookDeliveries.id });
      return requeued.length === 1;
    },
    async listDeliveries(take) {
      return (await client
        .select({
          id: webhookDeliveries.id,
          endpointId: webhookDeliveries.endpointId,
          endpointUrl: webhookEndpoints.url,
          event: webhookDeliveries.event,
          status: webhookDeliveries.status,
          attempts: webhookDeliveries.attempts,
          responseStatus: webhookDeliveries.responseStatus,
          lastError: webhookDeliveries.lastError,
          nextAttemptAt: webhookDeliveries.nextAttemptAt,
          createdAt: webhookDeliveries.createdAt,
          deliveredAt: webhookDeliveries.deliveredAt,
        })
        .from(webhookDeliveries)
        .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
        .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
        .limit(take)) as WebhookDeliveryView[];
    },
    async pruneDeliveries(before) {
      const pruned = await client
        .delete(webhookDeliveries)
        .where(and(lt(webhookDeliveries.createdAt, before), ne(webhookDeliveries.status, "PENDING")))
        .returning({ id: webhookDeliveries.id });
      return pruned.length;
    },
  };
}
