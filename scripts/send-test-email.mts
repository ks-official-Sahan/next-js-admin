// Sends ONE test email to the owner (ADMIN_EMAIL), through one chosen provider.
// Nothing is sent without --yes, and the recipient cannot be changed here, so a
// typo cannot mail anyone else. Step 5 "done when" uses it twice: once through
// Resend, once through SMTP with Resend switched off.
//
//   node --env-file=.env.local --conditions=react-server --import tsx \
//     scripts/send-test-email.mts --provider resend --yes
//   node --env-file=.env.local --conditions=react-server --import tsx \
//     scripts/send-test-email.mts --provider brevo-smtp --yes
//
// It prints the provider, the message id and the attempts. It never prints a key.

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const provider = value("provider");
if (provider !== "resend" && provider !== "brevo-smtp") {
  console.error("Pass --provider resend or --provider brevo-smtp.");
  process.exit(2);
}
const to = process.env.ADMIN_EMAIL?.trim();
if (!to) {
  console.error("ADMIN_EMAIL is not set.");
  process.exit(2);
}
if (!flag("yes")) {
  console.error(`Dry run. This would send one test email to ${to} through ${provider}. Add --yes to send it.`);
  process.exit(0);
}

// Force the provider before the environment is parsed, so there is no fallback and
// the test shows what this provider does on its own.
process.env.EMAIL_PROVIDER = provider;

const { sendEmail } = await import("../lib/email/index.ts");
const { mfaCode } = await import("../lib/email/templates/index.ts");
const { db } = await import("../lib/db/prisma.ts");

const rendered = mfaCode({ name: "Owner", code: "000000", minutes: 10 });
const result = await sendEmail({
  to,
  subject: `[Test] ${rendered.subject}`,
  html: rendered.html,
  text: rendered.text,
  category: "test",
});

console.log(
  JSON.stringify(
    {
      ok: result.ok,
      provider: result.provider,
      messageId: result.messageId ?? null,
      errorClass: result.errorClass ?? null,
      attempts: result.attempts.map(({ provider, ok, errorClass, status, ms }) => ({ provider, ok, errorClass, status, ms })),
    },
    null,
    2
  )
);
if (provider === "brevo-smtp" && result.ok) {
  console.log("Check the inbox. If it does not arrive, GET /api/admin/email/diagnostics?messageId=<id> explains why.");
}
await db.$disconnect();
process.exit(result.ok ? 0 : 1);
