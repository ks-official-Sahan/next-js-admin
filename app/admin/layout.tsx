import "@mantine/core/styles.css";
import "./admin.css";

import { headers } from "next/headers";

import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { MantineSyncProvider } from "@/components/theme/MantineSyncProvider";
import { AdminQueryProvider } from "@/lib/cache/react-query";

// No DOM, no metadata, no site chrome. It forces dynamic rendering, which the
// nonce based CSP needs, and mounts the theme provider with that nonce: the
// provider writes an inline script, and the CSP of /admin allows only scripts
// that carry the nonce the proxy generated for this request
// (design notes, sections 4.3 and 6.6).
//
// MantineSyncProvider is nested inside so its useTheme() call reads the same
// next-themes context; MediaPicker (components/admin/media/MediaPicker.tsx)
// uses @mantine/core's Button/Modal/etc and throws "MantineProvider was not
// found" without this. The public site's SiteShell.tsx used to mount its own
// MantineSyncProvider too (for the mobile nav Drawer), but that drawer is now
// plain accessible markup with no Mantine dependency, so this is the only
// place Mantine still loads.
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <ThemeProvider nonce={nonce} enableSystem attribute="class" defaultTheme="dark">
      <MantineSyncProvider>
        <AdminQueryProvider>{children}</AdminQueryProvider>
      </MantineSyncProvider>
    </ThemeProvider>
  );
}
