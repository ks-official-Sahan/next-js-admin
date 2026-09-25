"use client";

import dynamic from "next/dynamic";

import type { ChatbotConfig } from "@/lib/settings/schema";

// `next/dynamic` with `ssr: false` is only allowed from a Client Component in
// Next 16, so the lazy import lives here, one boundary below the server
// layout that decides whether to render this at all.
const ChatWidget = dynamic(() => import("./ChatWidget"), { ssr: false });

export default function ChatWidgetLoader(props: { enabled: boolean; config: ChatbotConfig; siteUrl: string }) {
  return <ChatWidget {...props} />;
}
