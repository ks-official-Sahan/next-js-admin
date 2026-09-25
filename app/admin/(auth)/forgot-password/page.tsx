import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import ForgotPasswordForm from "@/components/admin/auth/ForgotPasswordForm";
import { hasValidUnlock } from "@/lib/admin/unlock-request";
import { LOGIN_PATH } from "@/lib/auth/constants";
import { getOptionalUser } from "@/lib/auth/dal";

// Same anti-crawler gate as the login page: only a visitor holding the unlock
// cookie (or a session) ever reaches this form. Design notes,
// section 6.2, point 5.
export const metadata: Metadata = {
  title: { absolute: "Reset password - Admin" },
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true },
};

export default async function ForgotPasswordPage() {
  if (await getOptionalUser()) redirect("/admin");
  if (!(await hasValidUnlock())) notFound();

  return <ForgotPasswordForm loginUrl={LOGIN_PATH} />;
}
