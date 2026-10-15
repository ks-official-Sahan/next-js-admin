"use client";

import ActionForm, { ConfirmSubmitButton, SubmitButton, useActionResult } from "@/components/admin/ui/ActionForm";
import CopyField from "@/components/admin/ui/CopyField";
import { fieldClass } from "@/components/admin/ui/styles";
import {
  createWebhookAction,
  deleteWebhookAction,
  retryWebhookDeliveryAction,
  rotateWebhookSecretAction,
  testWebhookAction,
  toggleWebhookAction,
} from "@/lib/actions/webhooks";
import { WEBHOOK_EVENT_LABEL, WEBHOOK_EVENTS } from "@/lib/webhooks/policy";

/** The signing secret from the surrounding form's last result, shown once. */
function SecretReveal() {
  const { ok, secret } = useActionResult();
  return ok && secret ? (
    <CopyField className="mt-3" label="Signing secret" value={secret} hint="Shown once. Store it in your consumer to check X-Webhook-Signature." autoCopy />
  ) : null;
}

export function CreateWebhookForm() {
  return (
    <ActionForm action={createWebhookAction} className="space-y-4">
      <label className="grid gap-1 text-sm">
        <span>Endpoint URL</span>
        <input name="url" type="url" required inputMode="url" placeholder="https://example.com/api/sahan-webhook" className={fieldClass} />
      </label>
      <label className="grid gap-1 text-sm">
        <span>Description (optional)</span>
        <input name="description" maxLength={200} className={fieldClass} />
      </label>
      <fieldset className="space-y-2 text-sm">
        <legend className="mb-1">Events (leave all off to receive every event)</legend>
        {WEBHOOK_EVENTS.map((event) => (
          <label key={event} className="flex items-start gap-2">
            <input type="checkbox" name="events" value={event} className="mt-0.5 size-4 accent-primary" />
            <span>
              <code>{event}</code>: {WEBHOOK_EVENT_LABEL[event]}
            </span>
          </label>
        ))}
      </fieldset>
      <SubmitButton pendingLabel="Adding...">Add endpoint</SubmitButton>
      <SecretReveal />
    </ActionForm>
  );
}

function Hidden({ id }: { id: string }) {
  return <input type="hidden" name="id" value={id} />;
}

export function EndpointActions({ id, active, url }: { id: string; active: boolean; url: string }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <ActionForm action={testWebhookAction} showMessage={false}>
        <Hidden id={id} />
        <SubmitButton variant="small" pendingLabel="Sending...">
          Send test
        </SubmitButton>
      </ActionForm>
      <ActionForm action={toggleWebhookAction} showMessage={false}>
        <Hidden id={id} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <SubmitButton variant="small" pendingLabel="Saving...">
          {active ? "Turn off" : "Turn on"}
        </SubmitButton>
      </ActionForm>
      <ActionForm action={rotateWebhookSecretAction} showMessage={false}>
        <Hidden id={id} />
        <ConfirmSubmitButton variant="small" pendingLabel="Rotating..." confirmMessage="Make a new secret? The current one stops working at once.">
          Rotate secret
        </ConfirmSubmitButton>
        <SecretReveal />
      </ActionForm>
      <ActionForm action={deleteWebhookAction} showMessage={false}>
        <Hidden id={id} />
        <ConfirmSubmitButton variant="smallDanger" pendingLabel="Deleting..." confirmMessage={`Delete the endpoint ${url} and its delivery history?`}>
          Delete
        </ConfirmSubmitButton>
      </ActionForm>
    </div>
  );
}

export function RetryDeliveryForm({ id }: { id: string }) {
  return (
    <ActionForm action={retryWebhookDeliveryAction} showMessage={false}>
      <Hidden id={id} />
      <SubmitButton variant="small" pendingLabel="Retrying...">
        Retry
      </SubmitButton>
    </ActionForm>
  );
}
