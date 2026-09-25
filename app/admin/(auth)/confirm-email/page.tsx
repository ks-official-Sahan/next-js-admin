import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ConfirmEmailForm from "@/components/admin/auth/ConfirmEmailForm";
import { hashToken, tokenState, verifyTokenTag } from "@/lib/auth/invite-token";
import { db } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: { absolute: "Confirm email - Admin" },
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

const clock = () => Date.now();
const card = "rounded-lg border border-border bg-card p-6 text-card-foreground";

export default async function ConfirmEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  // The proxy only lets a link with a valid tag reach this page (matches
  // SET_PASSWORD_PATH's bypass in proxy.ts); check again here regardless.
  const random = verifyTokenTag(token, getEnv().AUTH_SECRET);
  if (!token || !random) notFound();

  const row = await db.authToken.findUnique({
    where: { tokenHash: hashToken(random) },
    select: { purpose: true, email: true, usedAt: true, revokedAt: true, expiresAt: true },
  });
  if (!row || row.purpose !== "EMAIL_CHANGE" || tokenState(row, clock()) !== "valid") {
    return (
      <div className={card}>
        <h1 className="text-xl font-semibold tracking-tight">This link is no longer valid</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It was already used, was cancelled or has expired. Ask for a new one from your account page.
        </p>
      </div>
    );
  }

  return <ConfirmEmailForm token={token} newEmail={row.email} />;
}
