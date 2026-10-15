"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Badge, Button, Card, Group, Image, Select, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";

import Icon from "@/components/icons/Icon";
import { MediaPicker } from "@/components/admin/media/MediaPicker";
import { useMediaPages } from "@/components/admin/media/use-media-pages";

type MediaKind = "IMAGE" | "VIDEO" | "DOCUMENT";
interface MediaItem {
  mediaId: string;
  src: string;
  kind: MediaKind;
  alt: string;
  title: string | null;
  folder: string;
  width: number | null;
  height: number | null;
}

export default function MediaLibrary({ canUpload }: { canUpload: boolean }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"ALL" | MediaKind>("ALL");
  const [refreshKey, setRefreshKey] = useState(0);
  const { items, nextCursor, loading, loadingMore, error, loadMore } = useMediaPages<MediaItem>(
    { limit: "24", q: query.trim() || undefined, kind: kind === "ALL" ? undefined : kind },
    { refreshKey }
  );

  const afterUpload = () => setRefreshKey((value) => value + 1);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Group align="flex-end" grow>
          <TextInput
            label="Search media"
            placeholder="Title, ID, alt text or folder"
            leftSection={<Icon name="magnifier" className="size-4" />}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            className="min-w-64"
          />
          <Select
            label="Kind"
            value={kind}
            onChange={(value) => setKind((value as "ALL" | MediaKind) || "ALL")}
            data={[
              { value: "ALL", label: "All media" },
              { value: "IMAGE", label: "Images" },
              { value: "VIDEO", label: "Videos" },
              { value: "DOCUMENT", label: "Documents" },
            ]}
            className="min-w-40"
          />
        </Group>
        {canUpload ? (
          <Group>
            <MediaPicker kind="IMAGE" uploadOnly onSelect={afterUpload} />
            <MediaPicker kind="DOCUMENT" uploadOnly onSelect={afterUpload} />
          </Group>
        ) : null}
      </Group>

      {error ? <Alert color="red" role="alert">{error}</Alert> : null}
      {loading ? <Text role="status" aria-live="polite" size="sm" c="dimmed">Loading media…</Text> : null}

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md" aria-busy={loading}>
        {items.map((asset) => (
          <Link key={asset.mediaId} href={`/admin/media/${asset.mediaId}`} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card withBorder h="100%">
              {asset.kind === "IMAGE" ? (
                <Card.Section withBorder inheritPadding py="xs">
                  <Image src={asset.src} alt="" height={180} fit="cover" />
                </Card.Section>
              ) : (
                <Card.Section withBorder p="lg" className="flex h-[180px] items-center justify-center bg-muted/30">
                  <Badge>{asset.kind}</Badge>
                </Card.Section>
              )}
              <Stack gap="xs" p="xs">
                <Text size="sm" fw={500} lineClamp={1}>{asset.title || asset.mediaId}</Text>
                <Group justify="space-between">
                  <Badge size="xs" variant="light">{asset.folder}</Badge>
                  <Text size="xs" c="dimmed">{asset.width && asset.height ? `${asset.width} × ${asset.height}` : asset.kind}</Text>
                </Group>
              </Stack>
            </Card>
          </Link>
        ))}
      </SimpleGrid>

      {!loading && items.length === 0 ? <Text py="xl" ta="center" c="dimmed">No media matches this search.</Text> : null}
      {nextCursor ? <Button variant="light" onClick={() => void loadMore()} loading={loadingMore}>Load more</Button> : null}
    </Stack>
  );
}
