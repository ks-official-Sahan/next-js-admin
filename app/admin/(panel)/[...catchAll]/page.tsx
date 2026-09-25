import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/dal";

// Any /admin/... path without a screen of its own. Real screens are separate
// folders next to this one and win over the catch-all.
export default async function AdminCatchAllPage() {
  await requireUser();
  notFound();
}
