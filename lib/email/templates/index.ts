import { oneLine, renderEmail as renderLayout, type EmailContent, type Rendered } from "@sahan-sac/email-kit/layout";

import { SiteMetadata } from "@/config/site";

// The emails the admin sends (design notes, step 5). Every
// function takes plain values and returns { subject, html, text }. Subjects are
// flattened to one line and cut short, so a name with a line break in it cannot
// add a header. Links must already be absolute; they are checked in the layout.

export type { Rendered } from "@sahan-sac/email-kit/layout";

const brand = SiteMetadata.title;
const renderEmail = (subject: string, content: EmailContent, copy = false) => renderLayout(subject, content, { brand, copy });

/** `copy`: the redacted version for EMAIL_CC, with every link left out (lib/email/account-mail.ts). */
export interface CopyOption {
  copy?: boolean;
}

/** A sign-in link (lib/auth/links.ts) under the main button, so the recipient can find the login page again later. */
const signInLater = (url: string | undefined, label = "Sign in later") =>
  url ? { secondaryLink: { label, url, note: "Opens the sign-in page on any device. Your password is still needed." } } : {};
const who = (name: string | null | undefined) => (name ? oneLine(name) : "there");

type CodePurpose = "SIGN_IN" | "ENABLE" | "DISABLE" | "STEP_UP";

/** What each kind of emailed code is for, in the words the email uses. */
const CODE_PURPOSE: Record<CodePurpose, { title: string; use: string; footnote: string }> = {
  SIGN_IN: { title: "sign-in code", use: "finish signing in to", footnote: "If you did not try to sign in, change your password now." },
  ENABLE: { title: "code to turn on two-factor sign-in", use: "turn on two-factor sign-in for", footnote: "If you did not ask for this, change your password now." },
  DISABLE: { title: "code to turn off two-factor sign-in", use: "turn off two-factor sign-in for", footnote: "If you did not ask for this, change your password now." },
  STEP_UP: { title: "confirmation code", use: "confirm a security change in", footnote: "If you did not ask for this, change your password now and tell your team." },
};

export function mfaCode(input: { name?: string | null; code: string; minutes: number; purpose?: CodePurpose }): Rendered {
  const purpose = CODE_PURPOSE[input.purpose ?? "SIGN_IN"];
  return renderEmail(`Your ${purpose.title}: ${oneLine(input.code, 12)}`, {
    preheader: `Your ${brand} admin ${purpose.title}`,
    heading: `Your ${purpose.title}`,
    paragraphs: [
      `Hi ${who(input.name)}, use this code to ${purpose.use} the ${brand} admin.`,
      oneLine(input.code, 12),
      `It works once and expires in ${input.minutes} minutes. Nobody from the site will ask you for it.`,
    ],
    footnote: purpose.footnote,
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

export function forcedLogout(input: {
  name?: string | null;
  by?: string | null;
  reason?: string | null;
  /** A sign-in link (lib/auth/links.ts), so the login page opens without the unlock secret. */
  signInUrl?: string;
}): Rendered {
  return renderEmail(`You were signed out of the ${brand} admin`, {
    preheader: "Your sessions were ended",
    heading: "Signed out",
    paragraphs: [
      `Hi ${who(input.name)}, all your sessions were ended${input.by ? ` by ${oneLine(input.by)}` : ""}.`,
      ...(input.reason ? [`Reason: ${oneLine(input.reason, 200)}`] : []),
      "Sign in again to continue.",
    ],
    ...(input.signInUrl ? { button: { label: "Sign in again", url: input.signInUrl } } : {}),
  });
}

export function invite(
  input: {
    name?: string | null;
    inviterName: string;
    role: string;
    url: string;
    expiresHours: number;
    signInUrl?: string;
  },
  options: CopyOption = {}
): Rendered {
  return renderEmail(`You are invited to the ${brand} admin`, {
    preheader: `${oneLine(input.inviterName)} invited you`,
    heading: "You are invited",
    paragraphs: [
      `Hi ${who(input.name)}, ${oneLine(input.inviterName)} invited you to the ${brand} admin as ${oneLine(input.role)}.`,
      `Choose your password to accept. The link works once and expires in ${input.expiresHours} hours.`,
    ],
    button: { label: "Accept invitation", url: input.url },
    ...signInLater(input.signInUrl),
    footnote: "If you were not expecting this, ignore this email and nothing happens.",
  }, options.copy);
}

export function accountCreated(
  input: { name?: string | null; creatorName: string; role: string; signInUrl: string },
  options: CopyOption = {}
): Rendered {
  return renderEmail(`Your ${brand} admin account is ready`, {
    preheader: `${oneLine(input.creatorName)} created your account`,
    heading: "Your account is ready",
    paragraphs: [
      `Hi ${who(input.name)}, ${oneLine(input.creatorName)} created an account for you in the ${brand} admin as ${oneLine(input.role)}.`,
      "Sign in with the password they gave you. You choose your own password the first time you sign in.",
    ],
    button: { label: "Sign in", url: input.signInUrl },
    footnote: "The password is never sent by email. If you were not expecting this, tell the site owner.",
  }, options.copy);
}

export function passwordReset(
  input: { name?: string | null; url: string; expiresMinutes: number; signInUrl?: string },
  options: CopyOption = {}
): Rendered {
  return renderEmail(`Reset your ${brand} admin password`, {
    preheader: "Choose a new password",
    heading: "Reset your password",
    paragraphs: [
      `Hi ${who(input.name)}, someone asked to reset the password of your admin account.`,
      `The link works once and expires in ${input.expiresMinutes} minutes.`,
    ],
    button: { label: "Choose a new password", url: input.url },
    ...signInLater(input.signInUrl, "Sign in afterwards"),
    footnote: "If you did not ask for this, ignore this email; your password stays as it is.",
  }, options.copy);
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
