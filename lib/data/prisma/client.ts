import type { Prisma, PrismaClient } from "@prisma/client";

/** The shared client or one interactive transaction. */
export type DbClient = PrismaClient | Prisma.TransactionClient;
