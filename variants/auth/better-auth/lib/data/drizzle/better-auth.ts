import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@/lib/db/drizzle";
import { users, userSessions } from "@/lib/db/schema";

/** Better Auth reads and writes `users` and `user_sessions` through the app's Drizzle client. */
export const BETTER_AUTH_ORM = "drizzle";
export const betterAuthDatabase = drizzleAdapter(db, { provider: "pg", schema: { users, userSessions } });
