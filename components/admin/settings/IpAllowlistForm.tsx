"use client";

import { useRef } from "react";

import ActionForm, { Field, SubmitButton } from "@/components/admin/ui/ActionForm";
import { textareaClass } from "@/components/admin/ui/styles";
import { updateIpAllowlistAction } from "@/lib/actions/settings";
import type { IpAllowlist } from "@/lib/settings/schema";
import { UNKNOWN_IP } from "@/lib/security/ip";
import { cn } from "@/lib/utils";

export interface KnownIp {
  ip: string;
  lastSeenAt: string | Date;
  userEmail: string;
}

function formatWhen(when: string | Date): string {
  const date = new Date(when);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function IpAllowlistForm({
  value,
  callerIp,
  knownIps = [],
}: {
  value: IpAllowlist;
  callerIp: string;
  knownIps?: KnownIp[];
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Appends an IP the textarea doesn't already have, uncontrolled (the ref
  // is the only source of truth, matching ActionForm's own uncontrolled
  // fields), so this never fights the form's restore-values-on-error logic.
  function addIp(ip: string) {
    const el = textareaRef.current;
    if (!el) return;
    const lines = el.value.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.includes(ip)) return;
    el.value = [...lines, ip].join("\n");
    el.focus();
  }

  return (
    <ActionForm action={updateIpAllowlistAction} className="space-y-4">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={value.enabled}
          className="size-4 rounded border-input"
        />
        Restrict /admin and /api/admin to these addresses
      </label>

      <div>
        <label htmlFor="ips" className="text-sm font-medium">
          Allowed IPs, IPv6 addresses or CIDR ranges (one per line)
        </label>
        <textarea
          ref={textareaRef}
          id="ips"
          name="ips"
          rows={6}
          defaultValue={value.ips.join("\n")}
          placeholder={"203.0.113.4\n2001:db8::/32"}
          className={cn(textareaClass, "mt-1.5 font-mono text-xs")}
        />
      </div>

      {knownIps.length > 0 && (
        <div>
          <p className="text-sm font-medium">Recently seen (from real sign-ins)</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Click one to add it above. Only addresses a session actually resolved — never{" "}
            <span className="font-mono">{UNKNOWN_IP}</span>.
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {knownIps.map((known) => (
              <li key={known.ip}>
                <button
                  type="button"
                  onClick={() => addIp(known.ip)}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-input px-3 py-1.5 text-left text-xs hover:bg-accent"
                >
                  <span className="font-mono">{known.ip}</span>
                  <span className="text-muted-foreground">
                    {known.userEmail} &middot; {formatWhen(known.lastSeenAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Your current request looks like it comes from <span className="font-mono">{callerIp}</span>.
        {callerIp === UNKNOWN_IP
          ? " This deployment cannot identify caller IPs (set TRUSTED_PROXY_HOPS behind your own reverse proxy, or deploy on Vercel), so turning the allowlist on will not be enforced for anyone until it can be."
          : " Saving an enabled list that does not include it is refused, so you cannot lock yourself out by accident."}
      </p>

      <Field label="Note (optional)" name="description" defaultValue={value.description} />

      <SubmitButton pendingLabel="Saving...">Save</SubmitButton>
    </ActionForm>
  );
}
