import { createDrizzleAuthAdapter } from "@sahan-sac/auth-kit/drizzle";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { auth } from "@/lib/db/schema";

import type { Repos, TxOptions } from "../repos";
import { auditRepo } from "./audit";
import { authTokenRepo } from "./auth-tokens";
import { chatRepo, chatTrainingRepo } from "./chat";
import type { DbClient } from "./client";
import { contentBlockRepo } from "./content";
import { inquiryRepo } from "./inquiries";
import { dashboardRepo, maintenanceRepo } from "./maintenance";
import { mediaRepo } from "./media";
import { postRepo, postRevisionRepo } from "./posts";
import { rolePermissionRepo } from "./role-permissions";
import { settingRepo } from "./settings";
import { userSessionRepo } from "./user-sessions";
import { userRepo } from "./users";

export { isDbUnavailable } from "./errors";

export function createRepos(client: DbClient): Repos {
  return {
    audit: auditRepo(client),
    authTokens: authTokenRepo(client),
    chat: chatRepo(client),
    chatTraining: chatTrainingRepo(client),
    contentBlocks: contentBlockRepo(client),
    dashboard: dashboardRepo(client),
    inquiries: inquiryRepo(client),
    maintenance: maintenanceRepo(client),
    media: mediaRepo(client),
    postRevisions: postRevisionRepo(client),
    posts: postRepo(client),
    rolePermissions: rolePermissionRepo(client),
    sessions: userSessionRepo(client),
    settings: settingRepo(client),
    users: userRepo(client),
  };
}

/** Runs `fn` in one transaction on `client`; every repository it receives writes inside it. */
export function transaction<T>(client: DbClient, fn: (tx: Repos) => Promise<T>, options?: TxOptions): Promise<T> {
  return client.transaction(async (tx) => {
    // Postgres has no whole-transaction timeout; cap each statement instead.
    if (options?.timeout) await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${Math.max(1, Math.trunc(options.timeout))}`));
    return fn(createRepos(tx));
  });
}

/** Repositories on the shared client. `db` is a lazy proxy, so this does not connect. */
export const repos: Repos = createRepos(db);

export function withTx<T>(fn: (tx: Repos) => Promise<T>, options?: TxOptions): Promise<T> {
  return transaction(db, fn, options);
}

// auth-kit's Drizzle adapter over the same client and the same auth tables.
export const authAdapter = createDrizzleAuthAdapter(db, auth);
