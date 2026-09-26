"use client";

import { useCallback, useRef, useState } from "react";
import { Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { Upload, Search, AlertCircle } from "lucide-react";

import { MEDIA_CONFIG } from "@/lib/media/config";
import { uploadToMediaLibrary } from "@/lib/media/upload-client";

export interface MediaPickerResult {
  mediaId: string;
  src: string;
  alt: string;
}

interface MediaPickerProps {
  onSelect: (result: MediaPickerResult) => void;
  kind?: "IMAGE" | "DOCUMENT";
  required?: boolean;
}

// Modal component for choosing or uploading media.
// Used by content and collection editors.
// Keyboard and screen-reader accessible.
export function MediaPicker({ onSelect, kind = "IMAGE", required = false }: MediaPickerProps) {
  const [opened, setOpened] = useState(false);
  const [mode, setMode] = useState<"browse" | "upload">("browse");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxSize = kind === "IMAGE" ? MEDIA_CONFIG.images.maxSizeBytes : MEDIA_CONFIG.documents.maxSizeBytes;
  const maxSizeMB = kind === "IMAGE" ? MEDIA_CONFIG.images.maxSizeMB : MEDIA_CONFIG.documents.maxSizeMB;
  const formats = kind === "IMAGE" ? MEDIA_CONFIG.images.formats : MEDIA_CONFIG.documents.formats;

  const handleUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      if (!file) return;

      setError(null);
      setUploading(true);

      try {
        const uploaded = await uploadToMediaLibrary(file, { fileName: file.name });
        if (!uploaded.ok) {
          setError(uploaded.error);
          return;
        }
        onSelect({ mediaId: uploaded.mediaId, src: uploaded.url, alt: "" });
        setOpened(false);
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [onSelect]
  );

  return (
    <>
      <Button
        onClick={() => setOpened(true)}
        variant="light"
        leftSection={<Upload size={16} />}
        aria-label={`Choose ${kind.toLowerCase()}`}
      >
        Choose {kind.toLowerCase()}
      </Button>

      <Modal
        opened={opened}
        onClose={() => {
          setOpened(false);
          setMode("browse");
          setSearch("");
          setError(null);
        }}
        title={`Select ${kind.toLowerCase()}`}
        size="lg"
        centered
      >
        <Stack gap="md">
          {error && (
            <Group gap="xs" p="xs" style={{ backgroundColor: "var(--mantine-color-red-0)" }} align="flex-start">
              <AlertCircle size={20} style={{ color: "var(--mantine-color-red-6)", flexShrink: 0 }} />
              <Text size="sm" style={{ color: "var(--mantine-color-red-7)" }}>
                {error}
              </Text>
            </Group>
          )}

          <Group>
            <Button.Group>
              <Button
                variant={mode === "browse" ? "filled" : "light"}
                onClick={() => {
                  setMode("browse");
                  setSearch("");
                }}
              >
                Browse
              </Button>
              <Button
                variant={mode === "upload" ? "filled" : "light"}
                onClick={() => {
                  setMode("upload");
                  setSearch("");
                }}
              >
                Upload
              </Button>
            </Button.Group>
          </Group>

          {mode === "browse" && (
            <>
              <TextInput
                placeholder="Search media..."
                leftSection={<Search size={16} />}
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                aria-label="Search media"
              />
              <Text size="sm" c="dimmed">
                Recent files would appear here. Upload a file to get started.
              </Text>
            </>
          )}

          {mode === "upload" && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={formats.map((f) => `.${f}`).join(",")}
                onChange={handleUpload}
                disabled={uploading}
                aria-label={`Upload ${kind.toLowerCase()}`}
              />
              <Text size="xs" c="dimmed">
                Formats: {formats.join(", ")} • Max {maxSizeMB}MB
              </Text>
              {uploading && <Text size="sm">Uploading...</Text>}
            </>
          )}
        </Stack>
      </Modal>
    </>
  );
}
