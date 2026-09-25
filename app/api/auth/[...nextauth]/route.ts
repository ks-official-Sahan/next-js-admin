// Sign-in and sign-out run as Server Functions (lib/actions/auth.ts) and the
// data access layer reads the session on the server, so none of the Auth.js
// endpoints is needed. They are not reachable: every method answers a bare 404.
// GET /api/auth/session would also return the `sid` and `pwf` claims to the
// browser, which nothing should see (design notes, section 4.1).
// /api/auth/expire is a sibling route and is matched before this catch-all.

const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

export const GET = notFound;
export const POST = notFound;
