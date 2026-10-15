"use client";

import { useCallback, useRef, useState } from "react";
import { Alert, Button, Group, Image, Modal, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";

import { MEDIA_CONFIG } from "@sahan-sac/media-kit/config";
import { uploadToMediaLibrary } from "@sahan-sac/media-kit/upload-client";

import Icon from "@/components/icons/Icon";
import { useMediaPages } from "@/components/admin/media/use-media-pages";
import { registerUpload } from "@/lib/actions/media";

export interface MediaPickerResult {
  mediaId: string;
  src: string;
  alt: string;
}

interface MediaPickerProps {
  onSelect: (result: MediaPickerResult) => void;
  kind?: "IMAGE" | "DOCUMENT";
  required?: boolean;
  /**
   * Upload a new file only, with no library browsing. For places that just
   * add to the library (the media library header), where picking an existing
   * asset would have nothing to return it to.
   */
  uploadOnly?: boolean;
}

interface MediaItem extends MediaPickerResult {
  kind: "IMAGE" | "DOCUMENT";
  title: string | null;
  folder: string;
  width: number | null;
  height: number | null;
}

// Modal component for choosing or uploading media. Search and pagination stay
// server-side, so the browser never downloads the full library to filter it.
export function MediaPicker({ onSelect, kind = "IMAGE", required = false, uploadOnly = false }: MediaPickerProps) {
  const [opened, setOpened] = useState(false);
  const [mode, setMode] = useState<"browse" | "upload">(uploadOnly ? "upload" : "browse");
  const [search, setSearch] = useState("");
  const [alt, setAlt] = useState("");
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [actionError, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxSizeMB = kind === "IMAGE" ? MEDIA_CONFIG.images.maxSizeMB : MEDIA_CONFIG.documents.maxSizeMB;
  const formats = kind === "IMAGE" ? MEDIA_CONFIG.images.formats : MEDIA_CONFIG.documents.formats;
  const altRequired = kind === "IMAGE" || required;

  const pages = useMediaPages<MediaItem>(
    { kind, limit: "24", q: search.trim() || undefined },
    { enabled: opened && mode === "browse" }
  );
  const { items, nextCursor, loading, loadingMore, loadMore } = pages;
  const error = actionError ?? pages.error;

  // Every way out of the modal (cancel, choose, upload) resets it, so the next
  // open never starts with a stale search, selection or alt text.
  const close = useCallback(() => {
    setOpened(false);
    setMode(uploadOnly ? "upload" : "browse");
    setSearch("");
    setAlt("");
    setSelected(null);
    setError(null);
  }, [uploadOnly]);

  const choose = useCallback(
    (result: MediaPickerResult) => {
      if (altRequired && !alt.trim()) {
        setError("Add alt text before choosing this image.");
        return;
      }
      onSelect({ ...result, alt: alt.trim() });
      close();
    },
    [alt, altRequired, close, onSelect]
  );

  const handleUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      if (!file) return;
      if (altRequired && !alt.trim()) {
        setError("Add alt text before uploading this image.");
        event.currentTarget.value = "";
        return;
      }

      setError(null);
      setUploading(true);
      try {
        const uploaded = await uploadToMediaLibrary(file, registerUpload, {
          fileName: file.name,
          ...(altRequired ? { alt: alt.trim() } : {}),
        });
        if (!uploaded.ok) {
          setError(uploaded.error);
          return;
        }
        onSelect({ mediaId: uploaded.mediaId, src: uploaded.url, alt: alt.trim() });
        close();
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [alt, altRequired, close, onSelect]
  );

  return (
    <>
      <Button type="button" onClick={() => setOpened(true)} variant="light" leftSection={<Icon name="upload" />}>
        {uploadOnly ? "Upload" : "Choose"} {kind.toLowerCase()}
      </Button>

      <Modal
        opened={opened}
        onClose={close}
        title={`${uploadOnly ? "Upload" : "Select"} ${kind.toLowerCase()}`}
        size="lg"
        centered
      >
        <Stack gap="md">
          {error ? <Alert color="red" icon={<Icon lucideIconName="AlertCircle" className="size-[18px]" />} role="alert">{error}</Alert> : null}

          {uploadOnly ? null : (
            <Group>
              <Button.Group aria-label="Media source">
                <Button type="button" aria-pressed={mode === "browse"} variant={mode === "browse" ? "filled" : "light"} onClick={() => setMode("browse")}>
                  Browse
                </Button>
                <Button type="button" aria-pressed={mode === "upload"} variant={mode === "upload" ? "filled" : "light"} onClick={() => setMode("upload")}>
                  Upload
                </Button>
              </Button.Group>
            </Group>
          )}

          {altRequired ? (
            <TextInput
              label="Alt text"
              description="Describe the image for people who cannot see it."
              value={alt}
              onChange={(event) => setAlt(event.currentTarget.value)}
              maxLength={500}
              required
              autoComplete="off"
            />
          ) : null}

          {mode === "browse" ? (
            <>
              <TextInput
                label="Search library"
                placeholder="Search by title, ID, alt text or folder"
                leftSection={<Icon name="magnifier" className="size-4" />}
                value={search}
                onChange={(event) => {
                  // A new search is a new result set: drop the old selection and its alt text.
                  setSearch(event.currentTarget.value);
                  setSelected(null);
                  setAlt("");
                }}
              />
              {loading ? <Text role="status" aria-live="polite" size="sm">Loading media…</Text> : null}
              {!loading && items.length === 0 ? <Text size="sm" c="dimmed">No media matches this search.</Text> : null}
              <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
                {items.map((item) => (
                  <button
                    key={item.mediaId}
                    type="button"
                    onClick={() => {
                      setSelected(item);
                      setAlt(item.alt || "");
                      setError(null);
                    }}
                    aria-pressed={selected?.mediaId === item.mediaId}
                    className="rounded-md border border-border p-2 text-left aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-primary/40"
                  >
                    {item.kind === "IMAGE" ? (
                      <Image src={item.src} alt="" h={92} fit="cover" radius="sm" />
                    ) : (
                      <span className="flex h-[92px] items-center justify-center rounded bg-muted/50">
                        <Icon name="file-description" className="size-7" />
                      </span>
                    )}
                    <Text size="xs" fw={500} mt="xs" lineClamp={1}>{item.title || item.mediaId}</Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>{item.folder}</Text>
                  </button>
                ))}
              </SimpleGrid>
              {nextCursor ? <Button type="button" variant="light" onClick={() => void loadMore()} loading={loadingMore}>Load more</Button> : null}
              {selected ? (
                <Button type="button" onClick={() => choose(selected)} disabled={altRequired && !alt.trim()}>
                  Use selected {kind.toLowerCase()}
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={formats.map((format) => `.${format}`).join(",")}
                onChange={handleUpload}
                disabled={uploading}
                aria-label={`Upload ${kind.toLowerCase()}`}
              />
              <Text size="xs" c="dimmed">Formats: {formats.join(", ")} • Max {maxSizeMB} MB</Text>
              {uploading ? <Text role="status" aria-live="polite" size="sm">Uploading…</Text> : null}
            </>
          )}
        </Stack>
      </Modal>
    </>
  );
}
