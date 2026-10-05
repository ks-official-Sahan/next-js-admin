import { prismaAdapter } from "better-auth/adapters/prisma";

import { db } from "@/lib/db/prisma";

/** Better Auth reads and writes `users` and `user_sessions` through the app's Prisma client. */
export const BETTER_AUTH_ORM = "prisma";
export const betterAuthDatabase = prismaAdapter(db, { provider: "postgresql" });
