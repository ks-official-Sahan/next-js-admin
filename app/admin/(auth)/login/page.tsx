import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import LoginForm from "@/components/admin/auth/LoginForm";
import { hasValidUnlock } from "@/lib/admin/unlock-request";
import { getOptionalUser } from "@/lib/auth/dal";
import { safeCallbackUrl } from "@/lib/auth/safe-callback-url";

// The proxy only lets this page render for a visitor who holds the unlock cookie
// (or a session), so a crawler never gets here. The metadata says the same in
// case it does.
export const metadata: Metadata = {
  title: { absolute: "Sign in - Admin" },
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true },
};

const NOTICES: Record<string, string> = {
  revoked: "Your session ended. Sign in again to continue.",
  expired: "Your session expired. Sign in again to continue.",
  "password-set": "Your password is saved. Sign in with it.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; reason?: string; notice?: string }>;
}) {
  const { callbackUrl, reason, notice } = await searchParams;
  const target = safeCallbackUrl(callbackUrl);

  if (await getOptionalUser()) redirect(target);

  // The proxy lets any signed session through, revoked ones included, so the form
  // itself needs the unlock cookie.
  if (!(await hasValidUnlock())) notFound();

  // Own keys only: a query value such as "constructor" must not reach the prototype.
  const key = notice ?? reason ?? "";
  return <LoginForm callbackUrl={target} notice={Object.hasOwn(NOTICES, key) ? NOTICES[key] : null} />;
}
