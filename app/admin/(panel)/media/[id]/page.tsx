import { Metadata } from "next";
import { Container, Grid, Card, Stack, Text, TextInput, Textarea, Button, Group, Badge, Alert, List } from "@mantine/core";
import { AlertTriangle, Trash2, ArrowLeft } from "lucide-react";
import Link from "next/link";

import { getOptionalUser, hasPermission } from "@/lib/auth/dal";
import { db } from "@/lib/db/prisma";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Media Details",
  robots: "noindex",
};

interface MediaDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function MediaDetailPage({ params }: MediaDetailPageProps) {
  const { id } = await params;
  const user = await getOptionalUser();
  if (!user || !hasPermission(user, "viewMedia")) return notFound();

  const asset = await db.mediaAsset.findUnique({
    where: { id },
    include: { usages: true },
  });

  if (!asset) return notFound();

  const canDelete = asset.usages.length === 0 && hasPermission(user, "deleteMedia");

  return (
    <Container>
      <Group mb="lg">
        <Link href="/admin/media">
          <Button leftSection={<ArrowLeft size={16} />} variant="light">
            Back
          </Button>
        </Link>
        <Text size="lg" fw={700}>
          {asset.title || asset.publicId || "Media"}
        </Text>
      </Group>

      <Grid>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="lg">
            {asset.kind === "IMAGE" && asset.url && (
              <Card withBorder>
                <Card.Section>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.url} alt={asset.alt || "Media"} style={{ maxWidth: "100%", maxHeight: 400 }} />
                </Card.Section>
              </Card>
            )}

            <Card withBorder>
              <Stack gap="md">
                <div>
                  <Text size="sm" fw={600} mb="xs">
                    Alt Text *
                  </Text>
                  <Textarea
                    placeholder="Describe this image for accessibility"
                    value={asset.alt || ""}
                    readOnly
                    minRows={3}
                  />
                  <Text size="xs" c="dimmed" mt="xs">
                    Alt text is required for all images. Edit from the upload page.
                  </Text>
                </div>

                <div>
                  <Text size="sm" fw={600} mb="xs">
                    Title
                  </Text>
                  <TextInput placeholder="Optional title" value={asset.title || ""} readOnly />
                </div>

                <div>
                  <Text size="sm" fw={600} mb="xs">
                    Folder
                  </Text>
                  <Badge>{asset.folder}</Badge>
                </div>

                <div>
                  <Text size="sm" fw={600} mb="xs">
                    Details
                  </Text>
                  <Group>
                    <div>
                      <Text size="xs" c="dimmed">
                        Size
                      </Text>
                      <Text size="sm" fw={500}>
                        {(asset.sizeBytes / 1024 / 1024).toFixed(2)} MB
                      </Text>
                    </div>
                    {asset.width && asset.height && (
                      <div>
                        <Text size="xs" c="dimmed">
                          Dimensions
                        </Text>
                        <Text size="sm" fw={500}>
                          {asset.width} × {asset.height}
                        </Text>
                      </div>
                    )}
                    <div>
                      <Text size="xs" c="dimmed">
                        Provider
                      </Text>
                      <Text size="sm" fw={500}>
                        {asset.provider}
                      </Text>
                    </div>
                  </Group>
                </div>
              </Stack>
            </Card>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="lg">
            {asset.usages.length > 0 && (
              <Alert icon={<AlertTriangle size={16} />} color="yellow" title="In Use">
                This media is used in {asset.usages.length} place{asset.usages.length === 1 ? "" : "s"}. It cannot be deleted
                until those references are removed.
                <List size="sm" mt="xs">
                  {asset.usages.slice(0, 5).map((usage) => (
                    <List.Item key={usage.id}>
                      {usage.entityType} ({usage.field})
                    </List.Item>
                  ))}
                  {asset.usages.length > 5 && <List.Item>... and {asset.usages.length - 5} more</List.Item>}
                </List>
              </Alert>
            )}

            {canDelete && (
              <Card withBorder style={{ backgroundColor: "var(--mantine-color-red-0)" }}>
                <Stack gap="md">
                  <Text size="sm" c="red">
                    Delete this media permanently. This action cannot be undone.
                  </Text>
                  <Button color="red" leftSection={<Trash2 size={16} />} fullWidth>
                    Delete
                  </Button>
                </Stack>
              </Card>
            )}

            <Card withBorder>
              <Stack gap="xs">
                <Text size="sm" fw={600}>
                  Created
                </Text>
                <Text size="sm">
                  {asset.createdAt.toLocaleDateString()} {asset.createdAt.toLocaleTimeString()}
                </Text>
              </Stack>
            </Card>
          </Stack>
        </Grid.Col>
      </Grid>
    </Container>
  );
}
