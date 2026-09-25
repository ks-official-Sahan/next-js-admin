import { PageMetadata } from "@/config/site";
import { pageMetadata } from "@/lib/metadata";
import type { Metadata } from "next";

export const metadata: Metadata = pageMetadata(
  "/updates",
  PageMetadata.updates
);

export default function UpdatesLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div>{children}</div>;
}
