import { Suspense } from "react";
import { Metadata } from "next";
import { Container, Group, Button, Stack, Text, TextInput, Select, SimpleGrid, Card, CardSection, Image, Badge } from "@mantine/core";
import { Upload, Search } from "lucide-react";

import { getOptionalUser, hasPermission } from "@/lib/auth/dal";
import { db } from "@/lib/db/prisma";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Media",
  robots: "noindex",
};

async function MediaList() {
  const user = await getOptionalUser();
  if (!user || !hasPermission(user, "viewMedia")) return notFound();

  const assets = await db.mediaAsset.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  if (assets.length === 0) {
    return (
      <Card withBorder p="lg">
        <Text c="dimmed" ta="center">
          No media uploaded yet. Upload your first image or document to get started.
        </Text>
      </Card>
    );
  }

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
      {assets.map((asset) => (
        <Card key={asset.id} withBorder component="a" href={`/admin/media/${asset.id}`} style={{ cursor: "pointer" }}>
          {asset.kind === "IMAGE" && asset.url && (
            <CardSection withBorder inheritPadding py="xs">
              <Image src={asset.url} alt={asset.alt || "Media"} height={180} fit="cover" />
            </CardSection>
          )}
          <Stack gap="xs" p="xs">
            <div>
              <Text size="sm" fw={500} truncate>
                {asset.title || asset.publicId || "Untitled"}
              </Text>
              <Badge size="xs" variant="light">
                {asset.folder}
              </Badge>
            </div>
            <Text size="xs" c="dimmed">
              {(asset.sizeBytes / 1024).toFixed(0)} KB
            </Text>
          </Stack>
        </Card>
      ))}
    </SimpleGrid>
  );
}

export default function MediaPage() {
  return (
    <Container>
      <Group justify="space-between" mb="lg">
        <Stack gap={0}>
          <Text size="xl" fw={700}>
            Media Library
          </Text>
          <Text size="sm" c="dimmed">
            Manage images and documents
          </Text>
        </Stack>
        <Button leftSection={<Upload size={16} />} component="a" href="/admin/media/upload">
          Upload
        </Button>
      </Group>

      <Group mb="lg">
        <TextInput
          placeholder="Search media..."
          leftSection={<Search size={16} />}
          style={{ flex: 1 }}
          disabled // Would filter the list
        />
        <Select
          placeholder="All folders"
          disabled // Would filter by folder
          data={["All folders", "Projects", "About", "Updates"]}
          style={{ minWidth: 200 }}
        />
      </Group>

      <Suspense fallback={<Text c="dimmed">Loading media...</Text>}>
        <MediaList />
      </Suspense>
    </Container>
  );
}
