// Answers "why did a mail sent through Brevo not arrive?" (risk R9: the Brevo HTTP
// API once accepted sends that were never delivered while SMTP delivered). It
// reads the account, the sender and domain lists and, when asked, the message
// events, then turns them into one verdict. Read only: it never sends mail.
// The API key goes into one request header and nowhere else; errors are reported
// by status code only. design notes, step 5.

const API = "https://api.brevo.com/v3";
const TIMEOUT_MS = 8000;

export interface BrevoEvent {
  date: string;
  email: string;
  event: string;
  messageId: string;
  reason?: string;
}

export interface SenderState {
  address: string | null;
  /** The sender address is set in the environment. */
  configured: boolean;
  /** The address is in the account's sender list and active. */
  verified: boolean;
  domain: string | null;
  /** SPF and DKIM are set up for the domain; null when the domain is not in the account. */
  domainAuthenticated: boolean | null;
}

export type VerdictCode =
  | "no_api_key"
  | "api_key_rejected"
  | "sender_not_verified"
  | "domain_not_authenticated"
  | "delivered"
  | "rejected"
  | "pending"
  | "no_events"
  | "ready"
  | "unreachable";

export interface Verdict {
  code: VerdictCode;
  message: string;
}

export interface BrevoDiagnostics {
  account: { reachable: boolean; plan: string | null };
  sender: SenderState;
  events: BrevoEvent[];
  verdict: Verdict;
  /** Short notes such as "GET /senders answered 403". No secrets. */
  notes: string[];
}

export interface DiagnosticsInput {
  messageId?: string;
  email?: string;
}

export interface DiagnosticsDeps {
  apiKey: string | undefined;
  /** Address the mail is sent from, for the sender and domain checks. */
  senderAddress: string | null;
  fetch?: typeof fetch;
}

const BAD_EVENTS = new Set(["hardBounces", "blocked", "invalid", "spam", "error", "unsubscribed"]);
const PENDING_EVENTS = new Set(["requests", "deferred", "softBounces"]);

export function brevoVerdict(input: {
  apiKeyPresent: boolean;
  accountReachable: boolean;
  accountStatus?: number;
  sender: SenderState;
  eventsQueried: boolean;
  events: readonly BrevoEvent[];
}): Verdict {
  if (!input.apiKeyPresent) {
    return { code: "no_api_key", message: "EMAIL_BREVO_API_KEY is not set, so Brevo cannot be inspected." };
  }
  if (!input.accountReachable) {
    const rejected = input.accountStatus === 401 || input.accountStatus === 403;
    return rejected
      ? { code: "api_key_rejected", message: "Brevo rejected the API key. Create a new key and update EMAIL_BREVO_API_KEY." }
      : { code: "unreachable", message: "Brevo could not be reached, so nothing can be said about delivery." };
  }
  if (!input.sender.configured) {
    return { code: "sender_not_verified", message: "No sender address is configured (DEFAULT_FROM_EMAIL)." };
  }
  if (!input.sender.verified) {
    return {
      code: "sender_not_verified",
      message:
        "The sender address is not an active, verified sender in Brevo. Brevo's API can answer success for such mail without delivering it; add and verify the sender, or send through SMTP.",
    };
  }
  if (input.sender.domainAuthenticated === false) {
    return {
      code: "domain_not_authenticated",
      message: "The sender domain is not authenticated in Brevo (SPF and DKIM). Mail from it is likely to be dropped or filtered.",
    };
  }

  if (!input.eventsQueried) {
    return { code: "ready", message: "The account, sender and domain look fine. Pass a message id or an address to check one send." };
  }
  const names = input.events.map((event) => event.event);
  if (names.includes("delivered")) return { code: "delivered", message: "Brevo reports the message as delivered." };
  const bad = input.events.find((event) => BAD_EVENTS.has(event.event));
  if (bad) {
    return { code: "rejected", message: `Brevo reports ${bad.event}${bad.reason ? `: ${bad.reason}` : ""}.` };
  }
  if (names.some((name) => PENDING_EVENTS.has(name))) {
    return { code: "pending", message: "Brevo accepted the message but has not delivered it yet (queued, deferred or soft bounced)." };
  }
  return {
    code: "no_events",
    message: "Brevo has no event for this message. It was probably never queued; check the sender and send through SMTP instead.",
  };
}

const senderDomain = (address: string | null) => address?.split("@")[1]?.toLowerCase() ?? null;

export async function runBrevoDiagnostics(
  input: DiagnosticsInput,
  deps: DiagnosticsDeps
): Promise<BrevoDiagnostics> {
  const doFetch = deps.fetch ?? fetch;
  const notes: string[] = [];
  const domain = senderDomain(deps.senderAddress);
  const sender: SenderState = {
    address: deps.senderAddress,
    configured: Boolean(deps.senderAddress),
    verified: false,
    domain,
    domainAuthenticated: null,
  };
  const empty = (verdict: Verdict, reachable = false, status?: number): BrevoDiagnostics => ({
    account: { reachable, plan: null },
    sender,
    events: [],
    verdict,
    notes: status ? [...notes, `GET /account answered ${status}`] : notes,
  });

  if (!deps.apiKey) {
    return empty(
      brevoVerdict({ apiKeyPresent: false, accountReachable: false, sender, eventsQueried: false, events: [] })
    );
  }
  const apiKey = deps.apiKey;

  async function get(path: string): Promise<{ status: number; body: unknown } | null> {
    try {
      const response = await doFetch(`${API}${path}`, {
        headers: { "api-key": apiKey, accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      const body = response.ok ? await response.json().catch(() => null) : null;
      return { status: response.status, body };
    } catch {
      return null;
    }
  }

  const account = await get("/account");
  if (!account || account.status !== 200) {
    return empty(
      brevoVerdict({
        apiKeyPresent: true,
        accountReachable: false,
        accountStatus: account?.status,
        sender,
        eventsQueried: false,
        events: [],
      }),
      false,
      account?.status
    );
  }
  const plans = (account.body as { plan?: Array<{ type?: string }> } | null)?.plan;
  const plan = plans?.[0]?.type ?? null;

  // The remaining reads are independent: run them together, so the report
  // takes two round trips instead of up to four.
  const eventsQueried = Boolean(input.messageId || input.email);
  const eventParams = new URLSearchParams({ limit: "20", sort: "desc", days: "7" });
  if (input.messageId) eventParams.set("messageId", input.messageId);
  if (input.email) eventParams.set("email", input.email);
  const [senders, domains, eventsResult] = await Promise.all([
    get("/senders"),
    domain ? get("/senders/domains") : Promise.resolve(null),
    eventsQueried ? get(`/smtp/statistics/events?${eventParams}`) : Promise.resolve(null),
  ]);
  if (senders?.status === 200) {
    const list = (senders.body as { senders?: Array<{ email?: string; active?: boolean }> } | null)?.senders ?? [];
    sender.verified = list.some(
      (entry) => entry.email?.toLowerCase() === deps.senderAddress?.toLowerCase() && entry.active !== false
    );
  } else {
    notes.push(`GET /senders answered ${senders?.status ?? "no response"}`);
  }

  if (domain) {
    if (domains?.status === 200) {
      const list =
        (domains.body as { domains?: Array<{ domain_name?: string; authenticated?: boolean }> } | null)?.domains ?? [];
      const match = list.find((entry) => entry.domain_name?.toLowerCase() === domain);
      sender.domainAuthenticated = match ? match.authenticated === true : null;
    } else {
      notes.push(`GET /senders/domains answered ${domains?.status ?? "no response"}`);
    }
  }

  let events: BrevoEvent[] = [];
  if (eventsQueried) {
    const result = eventsResult;
    if (result?.status === 200) {
      const raw = (result.body as { events?: BrevoEvent[] } | null)?.events ?? [];
      events = raw.map(({ date, email, event, messageId, reason }) => ({ date, email, event, messageId, reason }));
    } else {
      notes.push(`GET /smtp/statistics/events answered ${result?.status ?? "no response"}`);
    }
  }

  return {
    account: { reachable: true, plan },
    sender,
    events,
    verdict: brevoVerdict({
      apiKeyPresent: true,
      accountReachable: true,
      sender,
      eventsQueried,
      events,
    }),
    notes,
  };
}
