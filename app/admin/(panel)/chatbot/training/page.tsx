import { Metadata } from "next";
import Link from "next/link";

import { requirePermission } from "@/lib/auth/dal";
import { listTrainingEntries } from "@/lib/chatbot/training-queries";
import EmptyState from "@/components/admin/ui/EmptyState";
import { badgeClass, buttonVariants, tableClass, tdClass, thClass } from "@/components/admin/ui/styles";

export const metadata: Metadata = {
  title: "Training Data",
  robots: "noindex, nofollow, nocache",
};

export default async function TrainingPage() {
  await requirePermission("manageChatbot");

  const entries = await listTrainingEntries({ limit: 100 });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Training Data</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create FAQ entries and training examples to improve chatbot responses.
          </p>
        </div>
        <Link href="/admin/chatbot/training/new" className={buttonVariants.primary}>
          Add Training Entry
        </Link>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title="No training entries yet"
          description="Add an FAQ or training example to improve chatbot responses."
          action={
            <Link href="/admin/chatbot/training/new" className={buttonVariants.primary}>
              Create First Entry
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className={tableClass}>
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th scope="col" className={thClass}>
                  Question
                </th>
                <th scope="col" className={thClass}>
                  Category
                </th>
                <th scope="col" className={thClass}>
                  Priority
                </th>
                <th scope="col" className={thClass}>
                  Active
                </th>
                <th scope="col" className={thClass}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-muted/40">
                  <td className={`${tdClass} max-w-md truncate`}>{entry.question}</td>
                  <td className={tdClass}>{entry.category}</td>
                  <td className={tdClass}>{entry.priority}</td>
                  <td className={tdClass}>
                    <span className={badgeClass}>{entry.isActive ? "Yes" : "No"}</span>
                  </td>
                  <td className={`${tdClass} text-right`}>
                    <Link
                      href={`/admin/chatbot/training/${entry.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
