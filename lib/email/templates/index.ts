import { SiteMetadata } from "@/config/site";

import { oneLine, renderEmail, type Rendered } from "./layout";

// The nine emails the admin sends (design notes, step 5). Every
// function takes plain values and returns { subject, html, text }. Subjects are
// flattened to one line and cut short, so a name with a line break in it cannot
// add a header. Links must already be absolute; they are checked in the layout.

export type { Rendered } from "./layout";

const brand = SiteMetadata.title;
const who = (name: string | null | undefined) => (name ? oneLine(name) : "there");

export function mfaCode(input: { name?: string | null; code: string; minutes: number }): Rendered {
  return renderEmail(`Your sign-in code: ${oneLine(input.code, 12)}`, {
    preheader: `Your ${brand} admin sign-in code`,
    heading: "Your sign-in code",
    paragraphs: [
      `Hi ${who(input.name)}, use this code to finish signing in to the ${brand} admin.`,
      oneLine(input.code, 12),
      `It works once and expires in ${input.minutes} minutes. Nobody from the site will ask you for it.`,
    ],
    footnote: "If you did not try to sign in, change your password now.",
  });
}

export interface SignInDetails {
  name?: string | null;
  ip?: string | null;
  browser?: string | null;
  os?: string | null;
  when: string;
}

const deviceRows = (input: SignInDetails): Array<[string, string]> => [
  ["When", oneLine(input.when)],
  ["Device", oneLine([input.browser, input.os].filter(Boolean).join(" on ") || "Unknown")],
  ["IP address", oneLine(input.ip || "Unknown")],
];

export function newLogin(input: SignInDetails): Rendered {
  return renderEmail(`New sign-in to the ${brand} admin`, {
    preheader: "A new device signed in to your account",
    heading: "New sign-in",
    paragraphs: [`Hi ${who(input.name)}, your account was just used to sign in.`],
    details: deviceRows(input),
    footnote: "If this was not you, change your password and sign out all other sessions from your account page.",
  });
}

export function passwordChanged(input: SignInDetails): Rendered {
  return renderEmail(`Your ${brand} admin password was changed`, {
    preheader: "Your password was changed",
    heading: "Password changed",
    paragraphs: [`Hi ${who(input.name)}, the password of your admin account was changed and other sessions were signed out.`],
    details: deviceRows(input),
    footnote: "If you did not do this, ask the site owner to disable the account.",
  });
}

export function mfaToggled(input: SignInDetails & { enabled: boolean }): Rendered {
  const state = input.enabled ? "turned on" : "turned off";
  return renderEmail(`Two-factor sign-in ${state}`, {
    preheader: `Two-factor sign-in was ${state}`,
    heading: `Two-factor sign-in ${state}`,
    paragraphs: [`Hi ${who(input.name)}, two-factor sign-in was ${state} for your admin account.`],
    details: deviceRows(input),
    footnote: "If you did not do this, change your password now.",
  });
}

export function forcedLogout(input: { name?: string | null; by?: string | null; reason?: string | null }): Rendered {
  return renderEmail(`You were signed out of the ${brand} admin`, {
    preheader: "Your sessions were ended",
    heading: "Signed out",
    paragraphs: [
      `Hi ${who(input.name)}, all your sessions were ended${input.by ? ` by ${oneLine(input.by)}` : ""}.`,
      ...(input.reason ? [`Reason: ${oneLine(input.reason, 200)}`] : []),
      "Sign in again to continue.",
    ],
  });
}

export function invite(input: {
  name?: string | null;
  inviterName: string;
  role: string;
  url: string;
  expiresHours: number;
}): Rendered {
  return renderEmail(`You are invited to the ${brand} admin`, {
    preheader: `${oneLine(input.inviterName)} invited you`,
    heading: "You are invited",
    paragraphs: [
      `Hi ${who(input.name)}, ${oneLine(input.inviterName)} invited you to the ${brand} admin as ${oneLine(input.role)}.`,
      `Choose your password to accept. The link works once and expires in ${input.expiresHours} hours.`,
    ],
    button: { label: "Accept invitation", url: input.url },
    footnote: "If you were not expecting this, ignore this email and nothing happens.",
  });
}

export function passwordReset(input: { name?: string | null; url: string; expiresMinutes: number }): Rendered {
  return renderEmail(`Reset your ${brand} admin password`, {
    preheader: "Choose a new password",
    heading: "Reset your password",
    paragraphs: [
      `Hi ${who(input.name)}, someone asked to reset the password of your admin account.`,
      `The link works once and expires in ${input.expiresMinutes} minutes.`,
    ],
    button: { label: "Choose a new password", url: input.url },
    footnote: "If you did not ask for this, ignore this email; your password stays as it is.",
  });
}

export function contactNotify(input: {
  name: string;
  email: string;
  subject?: string | null;
  message: string;
  receivedAt: string;
  adminUrl?: string | null;
}): Rendered {
  return renderEmail(`New message from ${oneLine(input.name)}`, {
    preheader: oneLine(input.message, 90),
    heading: "New contact message",
    paragraphs: [input.message],
    details: [
      ["From", oneLine(input.name)],
      ["Email", oneLine(input.email, 254)],
      ...(input.subject ? [["Subject", oneLine(input.subject, 200)] as [string, string]] : []),
      ["Received", oneLine(input.receivedAt)],
    ],
    ...(input.adminUrl ? { button: { label: "Open in the admin", url: input.adminUrl } } : {}),
  });
}

export function emailChangeVerify(input: { name?: string | null; url: string; expiresMinutes: number }): Rendered {
  return renderEmail(`Confirm your new ${brand} admin email`, {
    preheader: "Confirm this address to finish changing your email",
    heading: "Confirm your new email",
    paragraphs: [
      `Hi ${who(input.name)}, confirm this address to finish changing the email on your admin account.`,
      `The link works once and expires in ${input.expiresMinutes} minutes.`,
    ],
    button: { label: "Confirm this email", url: input.url },
    footnote: "If you did not ask for this, ignore this email; your account keeps its current address.",
  });
}

export function emailChanged(input: SignInDetails & { newEmail: string }): Rendered {
  return renderEmail(`Your ${brand} admin email was changed`, {
    preheader: "Your account email was changed",
    heading: "Email address changed",
    paragraphs: [`Hi ${who(input.name)}, the email on your admin account was changed to ${oneLine(input.newEmail, 254)}.`],
    details: deviceRows(input),
    footnote: "If you did not do this, ask the site owner to disable the account.",
  });
}

export function contactAutoReply(input: { name: string }): Rendered {
  return renderEmail(`Thanks for your message, ${oneLine(input.name, 40)}`, {
    preheader: "Your message reached me",
    heading: "Thanks for getting in touch",
    paragraphs: [
      `Hi ${who(input.name)}, your message reached me. I read every one and reply as soon as I can, usually within a few days.`,
      `${brand}`,
    ],
    footnote: "This is an automatic confirmation. You do not need to reply to it.",
  });
}
