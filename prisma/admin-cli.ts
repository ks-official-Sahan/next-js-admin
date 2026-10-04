// Break-glass commands for the operator, run against the database directly:
//   pnpm db:admin clear-mfa <email>        turn the second factor off for an account
//   pnpm db:admin set-password <email>     set a new password (read from a hidden prompt or stdin)
//   pnpm db:admin revoke-sessions <email>  sign an account out everywhere
// Each one writes an audit row with the actor "cli", and none prints a secret.
// It exists for the case the admin itself cannot help: a lost mailbox with MFA
// on, or a locked-out owner (design notes, step 7).

import { audit } from "../lib/admin/audit";
import { hashPassword } from "../lib/auth/password";
import { checkPassword } from "../lib/auth/password-policy";
import { revokeUserSessions } from "../lib/auth/session-store";
import { createRepos } from "../lib/data/prisma";
import { db } from "../lib/db/prisma";

const ACTOR = { id: null, email: "cli" } as const;
const CTRL_C = String.fromCharCode(3);
const DELETE = String.fromCharCode(127);

function usage(): never {
  console.error("Usage: pnpm db:admin <clear-mfa | set-password | revoke-sessions> <email>");
  process.exit(2);
}

/** Reads a password without echoing it on a terminal, or one line from a pipe. */
function readSecret(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY) {
      let data = "";
      input.setEncoding("utf8");
      input.on("data", (chunk) => (data += chunk));
      input.on("end", () => resolve(data.split(/\r?\n/)[0] ?? ""));
      input.on("error", reject);
      return;
    }
    process.stdout.write(question);
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    let value = "";
    const onData = (chunk: string) => {
      for (const key of chunk) {
        if (key === CTRL_C) {
          process.stdout.write("\n");
          process.exit(130);
        }
        if (key === "\r" || key === "\n") {
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (key === DELETE || key === "\b") value = value.slice(0, -1);
        else value += key;
      }
    };
    input.on("data", onData);
  });
}

async function findUser(email: string) {
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, mfaEnabled: true },
  });
  if (!user) {
    console.error("No account has that email.");
    process.exit(1);
  }
  return user;
}

async function clearMfa(email: string) {
  const user = await findUser(email);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { mfaEnabled: false } });
    // Codes already in the mailbox must not work after this.
    await tx.mfaChallenge.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: new Date() } });
    await audit(
      {
        action: "auth.mfa.disabled",
        actor: ACTOR,
        entityType: "User",
        entityId: user.id,
        before: { mfaEnabled: user.mfaEnabled },
        after: { mfaEnabled: false },
        meta: { via: "cli", email: user.email },
      },
      createRepos(tx)
    );
  });
  console.log(`Two-factor sign-in is off for ${user.email}.`);
}

async function setPassword(email: string) {
  const user = await findUser(email);
  const password = await readSecret("New password: ");
  const policy = checkPassword(password, { email: user.email });
  if (!policy.ok) {
    console.error(`Password refused: ${policy.problems.join(" ")}`);
    process.exit(1);
  }
  const passwordHash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    // The operator knows this password, so the owner must choose their own at the next sign-in.
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: true },
    });
    await tx.authToken.updateMany({
      where: { purpose: "PASSWORD_RESET", userId: user.id, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await audit(
      {
        action: "auth.password.changed",
        actor: ACTOR,
        entityType: "User",
        entityId: user.id,
        meta: { via: "cli", email: user.email },
      },
      createRepos(tx)
    );
  });
  // The new hash already invalidates older sessions by fingerprint; this also ends the rows.
  await revokeUserSessions(user.id, { userId: null, reason: "cli_password" });
  console.log(`Password set for ${user.email}. They must change it at the next sign-in.`);
}

async function revokeSessions(email: string) {
  const user = await findUser(email);
  const ended = await revokeUserSessions(user.id, { userId: null, reason: "cli_revoke" });
  await audit({
    action: "auth.session.revoked",
    actor: ACTOR,
    entityType: "User",
    entityId: user.id,
    meta: { via: "cli", email: user.email, sessions: ended.length },
  });
  console.log(`Ended ${ended.length} session(s) for ${user.email}.`);
}

async function main() {
  const [command, email] = process.argv.slice(2);
  if (!command || !email) usage();
  switch (command) {
    case "clear-mfa":
      return clearMfa(email);
    case "set-password":
      return setPassword(email);
    case "revoke-sessions":
      return revokeSessions(email);
    default:
      return usage();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Command failed");
    process.exit(1);
  });
