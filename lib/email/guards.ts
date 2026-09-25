import type { EmailMessage, PreparedMessage } from "./types";

// Everything that reaches a mail header or an HTML body passes through here.
// A CR or LF inside an address, subject or name would let a caller add headers
// (for example a hidden Bcc), so those are refused rather than stripped.

export class EmailGuardError extends Error {
  constructor(
    readonly errorClass: string,
    message: string
  ) {
    super(message);
    this.name = "EmailGuardError";
  }
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

// CR, LF, NUL and the two Unicode line separators.
const HEADER_BREAK = /[\r\n\0\u2028\u2029]/;

export function assertNoHeaderInjection(value: string, label: string): void {
  if (HEADER_BREAK.test(value)) {
    throw new EmailGuardError("header_injection", `${label} contains a line break`);
  }
}

const MAX_ADDRESS = 254;
const ADDRESS =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/** A bare address. Returns it trimmed. */
export function assertAddress(input: string, label = "address"): string {
  const value = input.trim();
  assertNoHeaderInjection(value, label);
  if (value.length === 0 || value.length > MAX_ADDRESS || !ADDRESS.test(value)) {
    throw new EmailGuardError("bad_address", `${label} is not a valid email address`);
  }
  return value;
}

/** `name@example.com` or `Display Name <name@example.com>`, for the From header. */
export function assertMailbox(input: string, label = "sender"): string {
  const value = input.trim();
  assertNoHeaderInjection(value, label);
  const match = /^(?:(.*?)\s*)?<([^<>]+)>$/.exec(value);
  if (!match) return assertAddress(value, label);
  const name = (match[1] ?? "").trim().replace(/^"(.*)"$/, "$1");
  const address = assertAddress(match[2], label);
  if (name.length === 0) return address;
  if (name.length > 100) throw new EmailGuardError("bad_address", `${label} name is too long`);
  return `"${name.replace(/["\\]/g, "\\$&")}" <${address}>`;
}

/** Only http and https links go into an email. */
export function safeUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new EmailGuardError("bad_url", "link is not a valid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new EmailGuardError("bad_url", "link must use http or https");
  }
  return url.toString();
}

export const MAX_RECIPIENTS = 10;
const MAX_SUBJECT = 200;
const MAX_BODY = 200_000;

const list = (value: string | readonly string[] | undefined): string[] =>
  value === undefined ? [] : typeof value === "string" ? [value] : [...value];

/** Validates a message and returns the normalised form providers receive. */
export function prepareMessage(message: EmailMessage): PreparedMessage {
  const to = list(message.to).map((address) => assertAddress(address, "recipient"));
  const cc = list(message.cc).map((address) => assertAddress(address, "cc"));
  const bcc = list(message.bcc).map((address) => assertAddress(address, "bcc"));

  if (to.length === 0) throw new EmailGuardError("no_recipient", "message has no recipient");
  if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) {
    throw new EmailGuardError("too_many_recipients", `more than ${MAX_RECIPIENTS} recipients`);
  }

  const subject = message.subject.trim();
  assertNoHeaderInjection(subject, "subject");
  if (subject.length === 0 || subject.length > MAX_SUBJECT) {
    throw new EmailGuardError("bad_subject", "subject is empty or too long");
  }
  if (message.html.length > MAX_BODY || message.text.length > MAX_BODY) {
    throw new EmailGuardError("body_too_large", "message body is too large");
  }

  return {
    to,
    cc,
    bcc,
    subject,
    html: message.html,
    text: message.text,
    category: message.category,
    replyTo: message.replyTo === undefined ? undefined : assertAddress(message.replyTo, "reply-to"),
  };
}
