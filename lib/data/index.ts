import "server-only";

// The app's data access. Code outside lib/data talks to these repositories
// only; lib/data/prisma is the one place that knows the ORM. A project on
// another ORM swaps the implementation module below and nothing else.
export { authAdapter, authDatabase, isDbUnavailable, repos, withTx } from "./prisma";
export type { Repos, TxOptions } from "./repos";
