"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";

import EmptyState from "@/components/admin/ui/EmptyState";
import { Button, buttonVariants } from "@/components/ui/button";

// Catches errors thrown below the panel layout, so the shell stays usable. In
// production Next replaces the message with a digest, which is shown so a
// failure can be matched to the server log.
export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <EmptyState
        icon={<TriangleAlert />}
        title="Something went wrong"
        description={
          error.digest
            ? `This page could not be shown. Reference: ${error.digest}`
            : "This page could not be shown."
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={reset}>Try again</Button>
            <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
              Back to dashboard
            </Link>
          </div>
        }
      />
    </div>
  );
}
