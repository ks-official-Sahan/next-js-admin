export * from "@sahan-sac/auth-kit/mfa";

/** What to tell someone whose emailed code was refused, by verifyChallenge's reason. */
export const CODE_FAILURES = {
  invalid: "That code is not correct.",
  locked: "Too many wrong codes. Wait a few minutes and ask for a new one.",
  expired: "That code expired. Ask for a new one.",
  consumed: "That code was already used. Ask for a new one.",
} as const;
