import "server-only";

// The app's data access. Code outside lib/data talks to these repositories
// only; lib/data/drizzle is the one place that knows the ORM.
export { authAdapter, authDatabase, isDbUnavailable, repos, withTx } from "./drizzle";
export type { Repos, TxOptions } from "./repos";
