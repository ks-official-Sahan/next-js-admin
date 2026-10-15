import type { DeliveryStatus } from "@/lib/webhooks/policy";

export interface WebhookEndpointView {
  id: string;
  url: string;
  description: string;
  events: string[];
  active: boolean;
  createdAt: Date;
}

export interface WebhookTarget {
  id: string;
  url: string;
  secretCipher: string;
  active: boolean;
}

export interface WebhookDeliveryView {
  id: string;
  endpointId: string;
  endpointUrl: string;
  event: string;
  status: DeliveryStatus;
  attempts: number;
  responseStatus: number | null;
  lastError: string | null;
  nextAttemptAt: Date | null;
  createdAt: Date;
  deliveredAt: Date | null;
}

/** Everything one send needs. */
export interface DeliveryJob {
  id: string;
  event: string;
  payload: unknown;
  idempotencyKey: string;
  status: DeliveryStatus;
  attempts: number;
  endpoint: WebhookTarget;
}

export interface NewDelivery {
  endpointId: string;
  event: string;
  payload: unknown;
  idempotencyKey: string;
}

export interface DeliveryOutcome {
  status: DeliveryStatus;
  nextAttemptAt: Date | null;
  responseStatus: number | null;
  lastError: string | null;
  deliveredAt: Date | null;
}

export interface WebhookRepo {
  listEndpoints(): Promise<WebhookEndpointView[]>;
  countEndpoints(): Promise<number>;
  findEndpoint(id: string): Promise<(WebhookEndpointView & { secretCipher: string }) | null>;
  createEndpoint(input: { url: string; description: string; events: string[]; secretCipher: string; createdById: string | null }): Promise<WebhookEndpointView>;
  updateEndpoint(id: string, input: { active?: boolean; secretCipher?: string }): Promise<WebhookEndpointView | null>;
  deleteEndpoint(id: string): Promise<boolean>;
  /** Active endpoints that take `event` (an empty event list takes every event). */
  targetsFor(event: string): Promise<WebhookTarget[]>;
  /** Inserts deliveries; returns their ids. */
  enqueue(rows: NewDelivery[]): Promise<string[]>;
  findJobs(ids: string[]): Promise<DeliveryJob[]>;
  /** Pending deliveries of active endpoints whose next attempt is due, oldest first. */
  dueIds(now: Date, take: number): Promise<string[]>;
  /**
   * Takes a delivery for one attempt: counts the attempt and holds it until
   * `leaseUntil`. False when another worker already took this attempt.
   */
  claim(id: string, attempts: number, leaseUntil: Date): Promise<boolean>;
  finish(id: string, outcome: DeliveryOutcome): Promise<void>;
  /** Puts a delivery back in the queue for one more attempt now. */
  requeue(id: string, now: Date): Promise<boolean>;
  listDeliveries(take: number): Promise<WebhookDeliveryView[]>;
  pruneDeliveries(before: Date): Promise<number>;
}
