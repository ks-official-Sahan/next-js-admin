import "server-only";

import type { Prisma } from "@prisma/client";

/**
 * Locks every DEVELOPER row for the rest of the transaction and returns how many
 * of them are enabled. Two administrators demoting, disabling or deleting each
 * other at the same moment then run one after the other, and the second sees the
 * true count, so the last enabled DEVELOPER can never be removed by a race.
 */
export async function lockDevelopers(tx: Prisma.TransactionClient): Promise<number> {
  await tx.$queryRaw`SELECT id FROM users WHERE role = 'DEVELOPER' FOR UPDATE`;
  return tx.user.count({ where: { role: "DEVELOPER", disabledAt: null } });
}
