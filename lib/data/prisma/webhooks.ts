import type { Prisma } from "@prisma/client";

import type { DeliveryJob, WebhookDeliveryView, WebhookRepo } from "../webhooks";
import type { DbClient } from "./client";

const ENDPOINT_VIEW = { id: true, url: true, description: true, events: true, active: true, createdAt: true } as const;
const TARGET = { id: true, url: true, secretCipher: true, active: true } as const;

export function webhookRepo(client: DbClient): WebhookRepo {
  return {
    listEndpoints() {
      return client.webhookEndpoint.findMany({ orderBy: { createdAt: "asc" }, select: ENDPOINT_VIEW });
    },
    countEndpoints() {
      return client.webhookEndpoint.count();
    },
    findEndpoint(id) {
      return client.webhookEndpoint.findUnique({ where: { id }, select: { ...ENDPOINT_VIEW, secretCipher: true } });
    },
    createEndpoint(input) {
      return client.webhookEndpoint.create({ data: input, select: ENDPOINT_VIEW });
    },
    async updateEndpoint(id, input) {
      const { count } = await client.webhookEndpoint.updateMany({ where: { id }, data: input });
      return count === 1 ? client.webhookEndpoint.findUnique({ where: { id }, select: ENDPOINT_VIEW }) : null;
    },
    async deleteEndpoint(id) {
      const { count } = await client.webhookEndpoint.deleteMany({ where: { id } });
      return count === 1;
    },
    targetsFor(event) {
      return client.webhookEndpoint.findMany({
        where: { active: true, OR: [{ events: { isEmpty: true } }, { events: { has: event } }] },
        select: TARGET,
      });
    },
    async enqueue(rows) {
      if (rows.length === 0) return [];
      const created = await client.webhookDelivery.createManyAndReturn({
        data: rows.map((row) => ({ ...row, payload: row.payload as Prisma.InputJsonValue, nextAttemptAt: new Date() })),
        select: { id: true },
      });
      return created.map((row) => row.id);
    },
    async findJobs(ids) {
      if (ids.length === 0) return [];
      return (await client.webhookDelivery.findMany({
        where: { id: { in: ids } },
        select: { id: true, event: true, payload: true, idempotencyKey: true, status: true, attempts: true, endpoint: { select: TARGET } },
      })) as DeliveryJob[];
    },
    async dueIds(now, take) {
      const rows = await client.webhookDelivery.findMany({
        where: { status: "PENDING", nextAttemptAt: { lte: now }, endpoint: { active: true } },
        orderBy: { nextAttemptAt: "asc" },
        take,
        select: { id: true },
      });
      return rows.map((row) => row.id);
    },
    async claim(id, attempts, leaseUntil) {
      const { count } = await client.webhookDelivery.updateMany({
        where: { id, attempts, status: "PENDING" },
        data: { attempts: { increment: 1 }, nextAttemptAt: leaseUntil },
      });
      return count === 1;
    },
    async finish(id, outcome) {
      await client.webhookDelivery.update({ where: { id }, data: outcome });
    },
    async requeue(id, now) {
      const { count } = await client.webhookDelivery.updateMany({
        where: { id, status: { not: "DELIVERED" } },
        data: { status: "PENDING", nextAttemptAt: now },
      });
      return count === 1;
    },
    async listDeliveries(take) {
      const rows = await client.webhookDelivery.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        select: {
          id: true, endpointId: true, event: true, status: true, attempts: true, responseStatus: true,
          lastError: true, nextAttemptAt: true, createdAt: true, deliveredAt: true, endpoint: { select: { url: true } },
        },
      });
      return rows.map(({ endpoint, ...row }): WebhookDeliveryView => ({ ...row, endpointUrl: endpoint.url }));
    },
    async pruneDeliveries(before) {
      const { count } = await client.webhookDelivery.deleteMany({ where: { createdAt: { lt: before }, status: { not: "PENDING" } } });
      return count;
    },
  };
}
