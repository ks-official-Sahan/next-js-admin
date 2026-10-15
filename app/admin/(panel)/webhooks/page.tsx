import type { Metadata } from "next";

import { CreateWebhookForm, EndpointActions, RetryDeliveryForm } from "@/components/admin/webhooks/WebhookForms";
import EmptyState from "@/components/admin/ui/EmptyState";
import { cardClass, tableClass } from "@/components/admin/ui/styles";
import { formatDateTime, relativeTime } from "@/lib/admin/format";
import { requirePermission } from "@/lib/auth/dal";
import { repos } from "@/lib/data";
import { env } from "@/lib/env";
import { MAX_ENDPOINTS } from "@/lib/webhooks/policy";

export const metadata: Metadata = { title: "Webhooks" };

const DELIVERIES_SHOWN = 50;

// Read outside the component: a server render is one request, and this is its clock.
const clock = () => Date.now();

const STATUS_LABEL = { PENDING: "Pending", DELIVERED: "Delivered", FAILED: "Failed" } as const;

export default async function WebhooksPage() {
  await requirePermission("manageSettings");
  const nowMs = clock();
  const [endpoints, deliveries] = await Promise.all([repos.webhooks.listEndpoints(), repos.webhooks.listDeliveries(DELIVERIES_SHOWN)]);
  const configured = Boolean(env.INTERNAL_SIGNING_SECRET);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
        <p className="text-sm text-muted-foreground">
          Signed POST requests to your own services when site content changes. Each request carries an <code>X-Webhook-Signature</code> and an{" "}
          <code>Idempotency-Key</code>; see docs/headless-api.md for how to check them.
        </p>
      </header>

      {!configured ? (
        <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          INTERNAL_SIGNING_SECRET is not set on the server, so nothing can be signed or sent.
        </p>
      ) : null}

      <section className={`${cardClass} space-y-4`} aria-labelledby="endpoints-heading">
        <h2 id="endpoints-heading" className="text-lg font-semibold">
          Endpoints
        </h2>
        {endpoints.length === 0 ? (
          <EmptyState title="No endpoints yet" description="Add one below to start receiving events." />
        ) : (
          <ul className="divide-y divide-border">
            {endpoints.map((endpoint) => (
              <li key={endpoint.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all font-medium">{endpoint.url}</span>
                  <span className="rounded-full border border-border px-2 text-xs">{endpoint.active ? "On" : "Off"}</span>
                </div>
                {endpoint.description ? <p className="text-sm text-muted-foreground">{endpoint.description}</p> : null}
                <p className="text-xs text-muted-foreground">Events: {endpoint.events.length === 0 ? "all" : endpoint.events.join(", ")}</p>
                <EndpointActions id={endpoint.id} active={endpoint.active} url={endpoint.url} />
              </li>
            ))}
          </ul>
        )}
        {endpoints.length < MAX_ENDPOINTS ? (
          <details className="rounded-md border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium">Add an endpoint</summary>
            <div className="mt-4">
              <CreateWebhookForm />
            </div>
          </details>
        ) : null}
      </section>

      <section className={`${cardClass} space-y-4 overflow-x-auto`} aria-labelledby="deliveries-heading">
        <h2 id="deliveries-heading" className="text-lg font-semibold">
          Recent deliveries
        </h2>
        {deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <table className={tableClass}>
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">When</th>
                <th scope="col" className="py-2 pr-4 font-medium">Event</th>
                <th scope="col" className="py-2 pr-4 font-medium">Endpoint</th>
                <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                <th scope="col" className="py-2 pr-4 font-medium">Detail</th>
                <th scope="col" className="py-2 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id} className="border-b border-border last:border-0 align-top">
                  <td className="py-2 pr-4" title={formatDateTime(delivery.createdAt)}>{relativeTime(delivery.createdAt, nowMs)}</td>
                  <td className="py-2 pr-4"><code>{delivery.event}</code></td>
                  <td className="max-w-[16rem] truncate py-2 pr-4" title={delivery.endpointUrl}>{delivery.endpointUrl}</td>
                  <td className="py-2 pr-4">
                    {STATUS_LABEL[delivery.status]}
                    <span className="block text-xs text-muted-foreground">
                      {delivery.attempts} {delivery.attempts === 1 ? "attempt" : "attempts"}
                    </span>
                  </td>
                  <td className="max-w-[18rem] py-2 pr-4 text-xs text-muted-foreground">
                    {delivery.responseStatus ? `HTTP ${delivery.responseStatus}. ` : ""}
                    {delivery.lastError ?? ""}
                    {delivery.status === "PENDING" && delivery.nextAttemptAt ? ` Next try ${formatDateTime(delivery.nextAttemptAt)}.` : ""}
                  </td>
                  <td className="py-2">{delivery.status !== "DELIVERED" ? <RetryDeliveryForm id={delivery.id} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
