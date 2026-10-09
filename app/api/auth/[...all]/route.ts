// Sign-in and sign-out run as Server Functions (lib/actions/auth.ts) through
// the engine (lib/auth/engine.ts), and the data access layer reads the
// session on the server, so no engine endpoint is mounted: every method
// answers a bare 404. On next-auth, GET /api/auth/session would also hand the
// `sid` and `pwf` claims to the browser. /api/auth/expire and
// /api/auth/session-status are sibling routes, matched before this catch-all.

const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

export const GET = notFound;
export const POST = notFound;
