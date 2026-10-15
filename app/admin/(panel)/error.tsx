"use client";

import Link from "next/link";

import Icon from "@/components/icons/Icon";
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
        icon={<Icon name="triangle-alert" className="size-6" />}
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
