import "server-only";

// Better Auth's database adapter, from the data layer's ORM. The Drizzle
// variant swaps this one line.
export { BETTER_AUTH_ORM, betterAuthDatabase } from "./prisma/better-auth";
