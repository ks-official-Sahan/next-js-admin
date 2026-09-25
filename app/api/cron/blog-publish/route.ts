import { isValidCronSecret } from "@/lib/cron/auth";
import { blogPublishJob } from "@/lib/cron/jobs";
import { log } from "@/lib/log";

// Cron route: publish scheduled blog posts. Triggered by Vercel Cron on the
// daily schedule in vercel.json. Requires Authorization: Bearer CRON_SECRET,
// checked in constant time. Idempotent and logs counts only. Design:
// design notes, Step 16.

export async function GET(request: Request) {
  if (!isValidCronSecret(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response(null, { status: 401 });
  }

  try {
    const result = await blogPublishJob();
    return Response.json({ published: result.published, timestamp: new Date().toISOString() });
  } catch (err) {
    log.error("cron blog-publish: unexpected error", { error: String(err) });
    return new Response(null, { status: 500 });
  }
}
