import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/auth/dal";
import { getInquiry } from "@/lib/inquiries/service";
import { LeadDetail } from "@/components/admin/leads/LeadDetail";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export const metadata = {
  title: "Lead Details",
};

export default async function LeadDetailPage({ params }: PageProps) {
  await requirePermission("viewLeads");

  const { id } = await params;
  const inquiry = await getInquiry(id);

  if (!inquiry) {
    notFound();
  }

  return <LeadDetail inquiry={inquiry} />;
}
