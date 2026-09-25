import { SearchX } from "lucide-react";
import Link from "next/link";

import EmptyState from "@/components/admin/ui/EmptyState";
import { buttonVariants } from "@/components/ui/button";

// Admin styled 404 for signed-in users. It sits inside (panel), so the shell
// stays around it. A notFound() thrown by the panel layout itself skips this
// file and lands on the public 404, which is what an unauthenticated visitor
// must see (design notes, section 4.4).
export default function PanelNotFound() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <EmptyState
        icon={<SearchX />}
        title="Page not found"
        description="This admin page does not exist, or it is not available to you."
        action={
          <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
            Back to dashboard
          </Link>
        }
      />
    </div>
  );
}
