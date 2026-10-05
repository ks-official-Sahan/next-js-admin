"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";

import { isSafeHref } from "@/lib/cms/href";
import { MediaPicker } from "@/components/admin/media/MediaPicker";
import { cn } from "@/lib/utils";

import { PreservedBlock } from "./PreservedBlock";

// TipTap 3 editor for a post body, loaded on demand only
// (components/admin/blog/RichEditorField.tsx dynamic-imports this with
// ssr:false), so TipTap never ships to the public bundle
// (design notes, Step 12). The editor edits raw HTML; the
// server re-sanitizes it into contentHtml/contentText on save
// (lib/cms/rich-text.ts) — this component's own link/image checks are a
// convenience for the editor, not the security boundary.

interface RichEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Sizing for the editable area (e.g. a fixed height in Split mode); it scrolls inside. */
  className?: string;
}

export default function RichEditor({ value, onChange, className }: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        // StarterKit 3 bundles Link; configuring it here (not adding a second
        // Link extension) avoids TipTap's duplicate-extension warning.
        link: {
          openOnClick: false,
          autolink: false,
          // A defense-in-depth check alongside the server-side allowlist
          // (lib/cms/rich-text.ts), which is what actually enforces this.
          isAllowedUri: (url) => isSafeHref(url),
        },
      }),
      Image.configure({ inline: false }),
      PreservedBlock,
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
    editorProps: {
      attributes: {
        // The same typography as the published post, so Visual mode is WYSIWYG.
        class: cn(
          "post-content min-h-[320px] overflow-y-auto rounded-md border border-input bg-background px-4 py-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className
        ),
      },
    },
  });

  // The value prop can change under the editor (loading a different post,
  // an AI-drafted body replacing the current one, or an AI image landing
  // while the admin types) without remounting it. A focused editor keeps its
  // caret where it was instead of jumping to the end of the document.
  useEffect(() => {
    if (!editor || value === editor.getHTML()) return;
    const { from, to } = editor.state.selection;
    const focused = editor.isFocused;
    editor.commands.setContent(value, { emitUpdate: false });
    if (focused) editor.commands.setTextSelection({ from, to });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to `value` changing from outside
  }, [value]);

  if (!editor) return null;

  const setLink = () => {
    const url = window.prompt("Link URL");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!isSafeHref(url)) {
      window.alert("That URL is not allowed. Use an https, mailto or tel link, or a path on this site.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const buttonClass = (active: boolean) =>
    `rounded border px-2 py-1 text-xs font-medium ${active ? "border-primary bg-primary/10" : "border-input bg-background hover:bg-muted"}`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="Formatting">
        <button type="button" aria-label="Bold" title="Bold" className={buttonClass(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()}>
          <strong>B</strong>
        </button>
        <button type="button" aria-label="Italic" title="Italic" className={buttonClass(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <em>I</em>
        </button>
        <button type="button" aria-label="Strikethrough" title="Strikethrough" className={buttonClass(editor.isActive("strike"))} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <s>S</s>
        </button>
        <button type="button" aria-label="Heading 2" title="Heading 2" className={buttonClass(editor.isActive("heading", { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </button>
        <button type="button" aria-label="Heading 3" title="Heading 3" className={buttonClass(editor.isActive("heading", { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          H3
        </button>
        <button type="button" aria-label="Bullet list" title="Bullet list" className={buttonClass(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          • List
        </button>
        <button type="button" aria-label="Numbered list" title="Numbered list" className={buttonClass(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          1. List
        </button>
        <button type="button" aria-label="Blockquote" title="Blockquote" className={buttonClass(editor.isActive("blockquote"))} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          Quote
        </button>
        <button type="button" aria-label="Inline code" title="Inline code" className={buttonClass(editor.isActive("code"))} onClick={() => editor.chain().focus().toggleCode().run()}>
          Code
        </button>
        <button type="button" aria-label="Code block" title="Code block" className={buttonClass(editor.isActive("codeBlock"))} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          {"</>"}
        </button>
        <button type="button" aria-label="Horizontal rule" title="Horizontal rule" className={buttonClass(false)} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          HR
        </button>
        <button type="button" aria-label="Link" title="Link" className={buttonClass(editor.isActive("link"))} onClick={setLink}>
          Link
        </button>
        <MediaPicker
          kind="IMAGE"
          onSelect={(result) => {
            editor.chain().focus().setImage({ src: result.src, alt: result.alt || "" }).run();
          }}
        />
        <button
          type="button"
          aria-label="Undo"
          title="Undo"
          className={buttonClass(false)}
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          ↶
        </button>
        <button
          type="button"
          aria-label="Redo"
          title="Redo"
          className={buttonClass(false)}
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          ↷
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
