import type { Metadata } from "next";

// Frame of the pre-login pages: no navigation and no site chrome. `admin-root`
// gives the page the admin scrollbars and background (app/admin/admin.css).
//
// Every page under this group (login, forgot-password, set-password,
// confirm-email) already sets its own `robots: { index: false, follow: false,
// nocache: true }` — this is a layout-level backstop so a future page added
// here is never indexable by default even if it forgets to.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="admin-root flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
      <main id="admin-main" className="w-full max-w-sm">
        {children}
      </main>
    </div>
  );
}
