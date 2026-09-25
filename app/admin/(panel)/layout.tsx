import type { Metadata } from "next";

import AdminShell from "@/components/admin/shell/AdminShell";
import { requireUser } from "@/lib/auth/dal";

// The admin has its own title template and is never indexed. The user is read
// here to build the shell, but a layout does not re-render on navigation, so it
// is not the authorization check: each page and action calls the data access
// layer itself. `absolute` keeps the root's "| <site>" template off the
// fallback title.
export const metadata: Metadata = {
  title: { absolute: "Admin", template: "%s - Admin" },
  // Reset the social cards the root layout sets for the public site.
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true },
};

export default async function PanelLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The account page has to render for a user who must change their password, so
  // the layout lets them in and every other page enforces it (requireUser).
  const user = await requireUser({ allowPasswordChange: true });

  return (
    <AdminShell
      permissions={user.permissions}
      user={{ name: user.name, email: user.email, role: user.role }}
    >
      {children}
    </AdminShell>
  );
}
