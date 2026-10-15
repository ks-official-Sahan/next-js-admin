import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, Stack, Text } from "@mantine/core";

import MediaLibrary from "@/components/admin/media/MediaLibrary";
import { getOptionalUser, hasPermission } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Media",
  robots: "noindex",
};

export default async function MediaPage() {
  const user = await getOptionalUser();
  if (!user || user.mustChangePassword || !hasPermission(user, "viewMedia")) return notFound();

  return (
    <Container>
      <Stack gap="lg">
        <div>
          <Text size="xl" fw={700}>Media Library</Text>
          <Text size="sm" c="dimmed">Search, upload and manage images and documents.</Text>
        </div>
        <MediaLibrary canUpload={hasPermission(user, "uploadMedia")} />
      </Stack>
    </Container>
  );
}
