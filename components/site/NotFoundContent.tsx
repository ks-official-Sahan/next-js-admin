import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

/** Body of the public 404 page, shared by app/not-found.tsx and app/(site)/not-found.tsx. */
export default function NotFoundContent() {
  return (
    <div className="min-h-[94vh] px-2 py-8 flex flex-col gap-3 items-center justify-center w-full">
      <div className="flex flex-col items-center gap-3 text-center pb-4">
        <h2 className="text-7xl font-bold">404</h2>
        <p className="text-muted-foreground">Oops! Page You Looking Not Found</p>
      </div>

      <Link href="/" className={buttonVariants({})}>
        Back to homepage
      </Link>
    </div>
  );
}
