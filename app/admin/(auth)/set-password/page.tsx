import type { Metadata } from "next";
import { notFound } from "next/navigation";

import SetPasswordForm from "@/components/admin/auth/SetPasswordForm";
import { hashToken, tokenState, verifyTokenTag } from "@/lib/auth/invite-token";
import { db } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: { absolute: "Choose a password - Admin" },
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true },
  // The link carries a secret: never let it leak through the Referer header.
  referrer: "no-referrer",
};

// Read outside the component: a server render is one request, and this is its clock.
const clock = () => Date.now();

const card = "rounded-lg border border-border bg-card p-6 text-card-foreground";

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  // The proxy only lets a link with a valid tag reach this page; check again here
  // because a page must not depend on the layer in front of it.
  const random = verifyTokenTag(token, getEnv().AUTH_SECRET);
  if (!token || !random) notFound();

  const row = await db.authToken.findUnique({
    where: { tokenHash: hashToken(random) },
    select: { purpose: true, email: true, usedAt: true, revokedAt: true, expiresAt: true },
  });
  if (!row || tokenState(row, clock()) !== "valid") {
    return (
      <div className={card}>
        <h1 className="text-xl font-semibold tracking-tight">This link is no longer valid</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It was already used, was cancelled or has expired. Ask the person who invited you for a new one.
        </p>
      </div>
    );
  }

  const invite = row.purpose === "INVITE";
  return (
    <div className={card}>
      <h1 className="text-xl font-semibold tracking-tight">{invite ? "Accept your invitation" : "Choose a new password"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {invite ? "Set a password for" : "For the account"} <span className="font-medium text-foreground">{row.email}</span>.
      </p>
      <SetPasswordForm token={token} email={row.email} askName={invite} />
    </div>
  );
}
