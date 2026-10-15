"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Stack, TextInput, Textarea } from "@mantine/core";

import Icon from "@/components/icons/Icon";
import { deleteMedia, updateMedia } from "@/lib/actions/media";
import type { MediaKind } from "@/lib/data/media";

export default function MediaDetailsForm({
  mediaId,
  kind,
  initialAlt,
  initialTitle,
  initialTags,
  canEdit,
  canDelete,
}: {
  mediaId: string;
  kind: MediaKind;
  initialAlt: string;
  initialTitle: string;
  initialTags: string[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [alt, setAlt] = useState(initialAlt);
  const [title, setTitle] = useState(initialTitle);
  const [tags, setTags] = useState(initialTags.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await updateMedia(mediaId, alt, title || null, tags.split(",").map((tag) => tag.trim()).filter(Boolean));
      if (!result.ok) {
        setError(result.error || "Could not save media details.");
        return;
      }
      setMessage("Media details saved.");
      router.refresh();
    } catch {
      setError("Could not save media details. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this media permanently? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteMedia(mediaId);
      if (!result.ok) {
        setError(result.error || "Could not delete media.");
        return;
      }
      if (result.warning) window.alert(result.warning);
      router.push("/admin/media");
      router.refresh();
    } catch {
      setError("Could not delete media. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="md">
      {error ? <Alert color="red" role="alert">{error}</Alert> : null}
      {message ? <Alert color="green" role="status" aria-live="polite">{message}</Alert> : null}
      {kind === "IMAGE" && !initialAlt.trim() ? (
        <Alert color="yellow" title="No alt text yet">
          Screen readers skip this image until it has alt text. Describe it below and save.
        </Alert>
      ) : null}
      <form onSubmit={save}>
        <Stack gap="md">
          <Textarea
            label="Alt text"
            description={kind === "IMAGE" ? "Required for images. Describe the image in context." : "Optional description for this file."}
            value={alt}
            onChange={(event) => setAlt(event.currentTarget.value)}
            maxLength={500}
            required={kind === "IMAGE"}
            readOnly={!canEdit}
            minRows={3}
          />
          <TextInput label="Title" value={title} onChange={(event) => setTitle(event.currentTarget.value)} maxLength={200} readOnly={!canEdit} />
          <TextInput label="Tags" description="Comma separated" value={tags} onChange={(event) => setTags(event.currentTarget.value)} readOnly={!canEdit} />
          {canEdit ? (
            <Button type="submit" leftSection={<Icon name="save" />} loading={busy} disabled={busy}>Save details</Button>
          ) : null}
        </Stack>
      </form>
      {canDelete ? (
        <Button color="red" variant="light" leftSection={<Icon name="trash" />} onClick={() => void remove()} loading={busy} disabled={busy}>
          Delete media
        </Button>
      ) : null}
    </Stack>
  );
}
