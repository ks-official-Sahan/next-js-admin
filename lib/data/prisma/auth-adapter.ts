import type { Prisma } from "@prisma/client";
import { createPrismaAuthAdapter } from "@sahan-sac/auth-kit/prisma";

import { db } from "@/lib/db/prisma";

// auth-kit's Prisma adapter over this app's client. `db` is a lazy proxy, so
// building the adapter here does not connect.
export const authAdapter = createPrismaAuthAdapter<Prisma.TransactionClient>(db);
