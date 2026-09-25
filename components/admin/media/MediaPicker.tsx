"use client";

import { useCallback, useRef, useState } from "react";
import { Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { Upload, Search, AlertCircle } from "lucide-react";

import { registerUpload } from "@/lib/actions/media";
import { MEDIA_CONFIG } from "@/lib/media/config";

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
        // Step 1: Get signed upload params from /api/admin/uploads/sign
        const signResponse = await fetch("/api/admin/uploads/sign");
        if (!signResponse.ok) throw new Error("Failed to get upload signature");

        const signData = (await signResponse.json()) as {
          cloudName: string;
          uploadPreset: string;
          signature: string;
          timestamp: number;
          folder: string;
        };

        // Step 2: Upload to Cloudinary using unsigned widget pattern
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", signData.uploadPreset);
        formData.append("cloud_name", signData.cloudName);
        formData.append("folder", signData.folder);
        formData.append("signature", signData.signature);
        formData.append("timestamp", String(signData.timestamp));

        const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${signData.cloudName}/auto/upload`;
        const uploadResponse = await fetch(cloudinaryUrl, {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) throw new Error("Upload to Cloudinary failed");

        const uploadData = (await uploadResponse.json()) as {
          public_id: string;
          secure_url: string;
          width?: number;
          height?: number;
        };

        // Step 3: Register with backend (registerUpload action)
        const registerResponse = await registerUpload(uploadData.public_id, signData.folder);
        if (!registerResponse.ok) {
          throw new Error(registerResponse.error || "Failed to register upload");
        }

        onSelect({
          mediaId: registerResponse.asset?.id || uploadData.public_id,
          src: registerResponse.asset?.url || uploadData.secure_url,
          alt: "",
        });

        setOpened(false);
      } catch (err) {
        setError((err as Error).message || "Upload failed");
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
