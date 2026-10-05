// Sign-in and sign-out run as Server Functions (lib/actions/auth.ts) that call
// Better Auth's server API, and the data access layer reads the session on the
// server, so no Better Auth endpoint is mounted. Every method answers a bare
// 404. /api/auth/expire and /api/auth/session-status are sibling routes and
// are matched before this catch-all.

const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

export const GET = notFound;
export const POST = notFound;
