"use client";

import dynamic from "next/dynamic";

// Loads TipTap only on the client, and only for an admin who opens the blog
// editor: `ssr: false` keeps its ~85 KB (StarterKit + Link + ProseMirror) out
// of the server render and, combined with this being a dedicated module
// under the admin route boundary, out of the public bundle entirely
// (design notes, Step 12, "done when").

const RichEditor = dynamic(() => import("./RichEditor"), {
  ssr: false,
  loading: () => (
    <div className="min-h-[320px] rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      Loading editor…
    </div>
  ),
});

export default RichEditor;
