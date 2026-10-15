"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useActionState, useEffect, useState, useTransition, type ReactNode } from "react";

import { PasswordField } from "@/components/admin/ui/PasswordField";
import { buttonVariants, fieldClass } from "@/components/admin/ui/styles";
import {
  beginTotpSetupAction,
  confirmTotpSetupAction,
  passkeyRegistrationOptionsAction,
  regenerateRecoveryCodesAction,
  removePasskeyAction,
  removeTotpAction,
  verifyPasskeyRegistrationAction,
  type SecurityState,
} from "@/lib/actions/security";
import { toast } from "@/lib/admin/toast";
import { passkeyErrorMessage, unsupportedReason } from "@/lib/auth/passkey-browser";

import { usePasskeySupport, usePreparedOptions } from "../auth/use-passkey";

const idle: SecurityState = { ok: false, error: null, message: null };

export interface PasskeyView {
  id: string;
  name: string;
  added: string;
  lastUsed: string | null;
}

/** Toasts a result and hands its new recovery codes (if any) up for one-time display. */
function useResult(state: SecurityState, onCodes: (codes: string[]) => void) {
  useEffect(() => {
    if (state.message) toast.success(state.message);
    if (state.error) toast.error(state.error);
    if (state.recoveryCodes?.length) onCodes(state.recoveryCodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per result
  }, [state]);
}

function Pending({ pending, idle: idleLabel, busy }: { pending: boolean; idle: string; busy: string }) {
  return <>{pending ? busy : idleLabel}</>;
}

function ErrorLine({ state }: { state: SecurityState }) {
  return state.error ? (
    <p role="alert" className="text-sm text-destructive">
      {state.error}
    </p>
  ) : null;
}

/** A password prompt that opens under a button, for removals. */
function ConfirmWithPassword({
  label,
  action,
  hidden,
  onCodes,
  danger = true,
}: {
  label: string;
  action: (previous: SecurityState, formData: FormData) => Promise<SecurityState>;
  hidden?: Record<string, string>;
  onCodes: (codes: string[]) => void;
  danger?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  useResult(state, onCodes);
  return (
    <details className="w-full">
      <summary className={`${danger ? buttonVariants.smallDanger : buttonVariants.small} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>{label}</summary>
      <form action={formAction} className="mt-3 max-w-sm space-y-3 rounded-md border border-border p-3" noValidate>
        {Object.entries(hidden ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <PasswordField label="Your password" name="password" autoComplete="current-password" required maxLength={128} />
        <ErrorLine state={state} />
        <button type="submit" disabled={pending} className={danger ? buttonVariants.smallDanger : buttonVariants.small}>
          <Pending pending={pending} idle={label} busy="Working..." />
        </button>
      </form>
    </details>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = codes.join("\n");
  return (
    <div role="region" aria-label="Your new recovery codes" className="space-y-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
      <p className="text-sm font-medium">Save these recovery codes now. They are shown only once.</p>
      <p className="text-sm text-muted-foreground">
        Each one signs you in once if you lose your authenticator app or passkey. Keep them somewhere safe, like a password manager.
      </p>
      <ol className="grid grid-cols-2 gap-2 font-mono text-sm s640:grid-cols-5">
        {codes.map((code) => (
          <li key={code} className="rounded border border-border bg-background px-2 py-1 text-center">
            {code}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonVariants.small}
          onClick={async () => {
            try {
              if (!navigator.clipboard) throw new Error("no clipboard");
              await navigator.clipboard.writeText(text);
              toast.success("Recovery codes copied.");
            } catch {
              toast.error("Copy failed. Select the codes and copy them by hand.");
            }
          }}
        >
          Copy
        </button>
        <a className={buttonVariants.small} href={`data:text/plain;charset=utf-8,${encodeURIComponent(text + "\n")}`} download="recovery-codes.txt">
          Download
        </a>
        <button type="button" className={buttonVariants.small} onClick={onDone}>
          I saved them
        </button>
      </div>
    </div>
  );
}

function Row({ title, status, children }: { title: string; status: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-3 border-t border-border pt-4 first:border-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">{status}</span>
      </div>
      {children}
    </div>
  );
}

function AuthenticatorApp({ enabled, onCodes }: { enabled: boolean; onCodes: (codes: string[]) => void }) {
  const [started, beginAction, beginPending] = useActionState(beginTotpSetupAction, idle);
  const [confirmed, confirmAction, confirmPending] = useActionState(confirmTotpSetupAction, idle);
  useResult(started, onCodes);
  useResult(confirmed, onCodes);

  if (enabled) {
    return (
      <Row title="Authenticator app" status="Set up">
        <p className="text-sm text-muted-foreground">Signing in asks for the 6 digit code your app shows.</p>
        <ConfirmWithPassword label="Remove the app" action={removeTotpAction} onCodes={onCodes} />
      </Row>
    );
  }
  return (
    <Row title="Authenticator app" status="Not set up">
      <p className="text-sm text-muted-foreground">Use an app such as 1Password, Google Authenticator or Authy to make sign-in codes.</p>
      {started.ok && started.secret ? (
        <div className="space-y-3">
          {started.qr ? (
            // SVG made on the server by the qrcode library from our own otpauth URI.
            <div className="w-44 rounded-md bg-white p-2" aria-label="QR code for your authenticator app" role="img" dangerouslySetInnerHTML={{ __html: started.qr }} />
          ) : null}
          <p className="text-sm">
            Cannot scan? Enter this key in the app: <code className="select-all break-all rounded bg-muted px-1 py-0.5 font-mono text-xs">{started.secret}</code>
          </p>
          <form action={confirmAction} className="flex max-w-sm items-end gap-2" noValidate>
            <label className="grid flex-1 gap-1 text-sm">
              <span>6 digit code</span>
              <input name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={10} className={fieldClass} />
            </label>
            <button type="submit" disabled={confirmPending} className={buttonVariants.small}>
              <Pending pending={confirmPending} idle="Confirm" busy="Checking..." />
            </button>
          </form>
          <ErrorLine state={confirmed} />
        </div>
      ) : (
        <form action={beginAction}>
          <button type="submit" disabled={beginPending} className={buttonVariants.small}>
            <Pending pending={beginPending} idle="Set up an authenticator app" busy="Preparing..." />
          </button>
          <ErrorLine state={started} />
        </form>
      )}
    </Row>
  );
}

type RegistrationOptions = Extract<Awaited<ReturnType<typeof passkeyRegistrationOptionsAction>>, { ok: true }>;
const UNREACHABLE = "Could not reach the server. Check your connection and try again.";

function Passkeys({ list, onCodes, rpId, rpIds }: { list: PasskeyView[]; onCodes: (codes: string[]) => void; rpId: string; rpIds: readonly string[] }) {
  const [name, setName] = useState("");
  const [result, setResult] = useState<SecurityState>(idle);
  const [pending, start] = useTransition();
  const support = usePasskeySupport(rpId);
  useResult(result, onCodes);
  // Options are fetched before the tap so the prompt opens inside it (iOS
  // Safari drops the tap's user activation behind a network round trip).
  const prepared = usePreparedOptions<RegistrationOptions>(support === "ready" ? "register" : null, async () => {
    const options = await passkeyRegistrationOptionsAction();
    return options.ok ? options : null;
  });

  function add() {
    const ready = prepared.take();
    start(async () => {
      try {
        await register(ready);
      } finally {
        prepared.refresh();
      }
    });
  }

  async function register(ready: RegistrationOptions | null) {
    let options = ready;
    if (!options) {
      const fetched = await passkeyRegistrationOptionsAction().catch(() => null);
      if (!fetched) return setResult({ ...idle, error: UNREACHABLE });
      if (!fetched.ok) return setResult({ ...idle, error: fetched.error });
      options = fetched;
    }
    let response: Awaited<ReturnType<typeof startRegistration>>;
    try {
      response = await startRegistration({ optionsJSON: options.options as Parameters<typeof startRegistration>[0]["optionsJSON"] });
    } catch (failure) {
      return setResult({ ...idle, error: passkeyErrorMessage(failure, rpId, "add") });
    }
    const challengeId = options.challengeId;
    const verified = await verifyPasskeyRegistrationAction({ challengeId, response, name }).catch(() => null);
    setResult(verified ?? { ...idle, error: UNREACHABLE });
    if (verified?.ok) setName("");
  }

  const blocked = support !== null && support !== "ready" ? unsupportedReason(support, rpId) : null;

  return (
    <Row title="Passkeys" status={list.length === 0 ? "None" : `${list.length} added`}>
      <p className="text-sm text-muted-foreground">Sign in with your fingerprint, face or device PIN, or a security key.</p>
      {rpIds.length > 1 ? (
        <p className="text-sm text-muted-foreground">
          A passkey works only on the address where you add it. One added here works at {rpId}. Add one at{" "}
          {rpIds.filter((id) => id !== rpId).join(", ")} too, so you can still sign in if this address is down.
        </p>
      ) : null}
      {list.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {list.map((passkey) => (
            <li key={passkey.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
              <div className="text-sm">
                <p className="font-medium">{passkey.name}</p>
                <p className="text-xs text-muted-foreground">
                  Added {passkey.added}
                  {passkey.lastUsed ? `, last used ${passkey.lastUsed}` : ", not used yet"}
                </p>
              </div>
              <div className="w-full s640:w-auto">
                <ConfirmWithPassword label="Remove" action={removePasskeyAction} hidden={{ id: passkey.id }} onCodes={onCodes} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex max-w-sm items-end gap-2">
        <label className="grid flex-1 gap-1 text-sm">
          <span>Name (optional)</span>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Work laptop" className={fieldClass} />
        </label>
        <button type="button" onClick={add} disabled={pending || blocked !== null} className={buttonVariants.small}>
          <Pending pending={pending} idle="Add a passkey" busy="Waiting..." />
        </button>
      </div>
      {blocked ? <p className="text-sm text-muted-foreground">{blocked}</p> : null}
      <ErrorLine state={result} />
    </Row>
  );
}

export default function SecurityFactors({
  totp,
  passkeys,
  recoveryCodesLeft,
  rpId,
  rpIds = [rpId],
}: {
  totp: boolean;
  passkeys: PasskeyView[];
  recoveryCodesLeft: number;
  /** The passkey relying party for this address (lib/auth/passkeys.ts). */
  rpId: string;
  /** Every configured relying party, primary first. */
  rpIds?: readonly string[];
}) {
  const [codes, setCodes] = useState<string[] | null>(null);
  const strong = totp || passkeys.length > 0;
  return (
    <div className="space-y-4">
      {codes ? <RecoveryCodes codes={codes} onDone={() => setCodes(null)} /> : null}
      <AuthenticatorApp enabled={totp} onCodes={setCodes} />
      <Passkeys list={passkeys} onCodes={setCodes} rpId={rpId} rpIds={rpIds} />
      {strong ? (
        <Row title="Recovery codes" status={`${recoveryCodesLeft} left`}>
          <p className="text-sm text-muted-foreground">
            {recoveryCodesLeft > 0 ? "Each code signs you in once if you lose your app or passkey." : "You have no recovery codes left. Make new ones."}
          </p>
          <ConfirmWithPassword label="Make new recovery codes" action={regenerateRecoveryCodesAction} onCodes={setCodes} danger={false} />
        </Row>
      ) : null}
    </div>
  );
}
