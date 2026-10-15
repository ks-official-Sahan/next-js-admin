import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Button, Card, CardSection, Container, Grid, GridCol, Group, List, ListItem, Stack, Text } from "@mantine/core";

import Icon from "@/components/icons/Icon";
import MediaDetailsForm from "@/components/admin/media/MediaDetailsForm";
import { getOptionalUser, hasPermission } from "@/lib/auth/dal";
import { repos } from "@/lib/data";

export const metadata: Metadata = {
  title: "Media Details",
  robots: "noindex",
};

export default async function MediaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getOptionalUser();
  if (!user || user.mustChangePassword || !hasPermission(user, "viewMedia")) return notFound();

  const asset = await repos.media.findWithUsages(id);
  if (!asset) return notFound();

  const canEdit = hasPermission(user, "uploadMedia");
  const canDelete = asset.usages.length === 0 && hasPermission(user, "deleteMedia");

  return (
    <Container>
      <Group mb="lg">
        <Button component={Link} href="/admin/media" leftSection={<Icon name="arrow-narrow-left" className="size-4" />} variant="light">
          Back
        </Button>
        <Text size="lg" fw={700}>{asset.title || asset.publicId || "Media"}</Text>
      </Group>

      <Grid>
        <GridCol span={{ base: 12, md: 8 }}>
          <Stack gap="lg">
            {asset.kind === "IMAGE" && asset.url ? (
              <Card withBorder>
                <CardSection>
                  {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of a Cloudinary/LOCAL asset */}
                  <img src={asset.url} alt={asset.alt || asset.title || asset.publicId || "Uploaded image"} style={{ maxWidth: "100%", maxHeight: 400 }} />
                </CardSection>
              </Card>
            ) : null}

            <Card withBorder>
              <MediaDetailsForm
                mediaId={asset.id}
                kind={asset.kind}
                initialAlt={asset.alt || ""}
                initialTitle={asset.title || ""}
                initialTags={asset.tags}
                canEdit={canEdit}
                canDelete={canDelete}
              />
            </Card>
          </Stack>
        </GridCol>

        <GridCol span={{ base: 12, md: 4 }}>
          <Stack gap="lg">
            {asset.usages.length > 0 ? (
              <Alert icon={<Icon name="triangle-alert" className="size-4" />} color="yellow" title="In use">
                This media is referenced in {asset.usages.length} place{asset.usages.length === 1 ? "" : "s"}; remove those references before deleting it.
                <List size="sm" mt="xs">
                  {asset.usages.slice(0, 5).map((usage) => (
                    <ListItem key={usage.id}>{usage.entityType} ({usage.field})</ListItem>
                  ))}
                  {asset.usages.length > 5 ? <ListItem>{asset.usages.length - 5} more</ListItem> : null}
                </List>
              </Alert>
            ) : null}

            <Card withBorder>
              <Stack gap="xs">
                <Group justify="space-between"><Text size="sm" fw={600}>Kind</Text><Badge>{asset.kind}</Badge></Group>
                <Group justify="space-between"><Text size="sm" fw={600}>Folder</Text><Badge variant="light">{asset.folder}</Badge></Group>
                <Group justify="space-between"><Text size="sm" fw={600}>Size</Text><Text size="sm">{(asset.sizeBytes / 1024 / 1024).toFixed(2)} MB</Text></Group>
                {asset.width && asset.height ? (
                  <Group justify="space-between"><Text size="sm" fw={600}>Dimensions</Text><Text size="sm">{asset.width} × {asset.height}</Text></Group>
                ) : null}
                <Group justify="space-between"><Text size="sm" fw={600}>Provider</Text><Text size="sm">{asset.provider}</Text></Group>
                <Text size="xs" c="dimmed">Created {asset.createdAt.toLocaleDateString()} {asset.createdAt.toLocaleTimeString()}</Text>
              </Stack>
            </Card>
          </Stack>
        </GridCol>
      </Grid>
    </Container>
  );
}
