import { AlertCircle, AlertTriangle, CheckCircle, FileText, Inbox, PenLine } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import {
  getContentCounts,
  getEmailHealth,
  getNewInquiriesCount,
  getRecentActivity,
  getSystemHealth,
  getUserSecurityStatus,
} from "@/lib/admin/dashboard";
import { hasPermission, requirePermission } from "@/lib/auth/dal";

// A title template does not apply to the page in the same segment as the layout
// that defines it, so the dashboard spells out its full title.
export const metadata: Metadata = { title: { absolute: "Dashboard - Admin" } };

export default async function DashboardPage() {
  const user = await requirePermission("viewDashboard");

  const canViewAudit = hasPermission(user, "viewAuditLogs");
  const canViewContent = hasPermission(user, "editPages") || hasPermission(user, "editCollections");
  const canViewLeads = hasPermission(user, "viewLeads");
  const canViewSecurityStatus = hasPermission(user, "viewSecurityStatus");

  // Every query tolerates an unconfigured database and returns a safe empty
  // value instead of throwing (lib/admin/dashboard.ts). Only the queries the
  // viewer's permissions cover are run at all.
  const [activity, { drafts, unpublished }, inquiries, health, emailHealth, securityStatus] = await Promise.all([
    canViewAudit ? getRecentActivity(5) : Promise.resolve([]),
    canViewContent ? getContentCounts() : Promise.resolve({ drafts: 0, unpublished: 0 }),
    canViewLeads ? getNewInquiriesCount() : Promise.resolve(0),
    canViewSecurityStatus ? getSystemHealth() : Promise.resolve(null),
    canViewSecurityStatus ? getEmailHealth() : Promise.resolve(null),
    getUserSecurityStatus(user.id),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">A summary of the site, its content and its inbox.</p>
      </div>

      {/* Security banner: password change required. Always shown to the signed-in
          user themselves, regardless of permissions — it is about their own account. */}
      {securityStatus.mustChangePassword && (
        <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900 dark:bg-yellow-950">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
            <div>
              <h3 className="font-medium text-yellow-900 dark:text-yellow-200">Password change required</h3>
              <p className="mt-1 text-sm text-yellow-800 dark:text-yellow-300">
                Your password was set by an administrator. Change it on your account page.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {canViewContent && (
          <Card icon={<FileText className="h-5 w-5 text-blue-600" />} label="Drafts">
            <div className="text-3xl font-bold">{drafts}</div>
            <p className="mt-1 text-xs text-muted-foreground">unpublished content blocks</p>
          </Card>
        )}

        {canViewContent && (
          <Card icon={<PenLine className="h-5 w-5 text-blue-600" />} label="Unpublished changes">
            <div className="text-3xl font-bold">{unpublished}</div>
            <p className="mt-1 text-xs text-muted-foreground">drafts and scheduled items</p>
          </Card>
        )}

        {canViewLeads && (
          <Card icon={<Inbox className="h-5 w-5 text-green-600" />} label="New inquiries">
            <div className="text-3xl font-bold">{inquiries}</div>
            <p className="mt-1 text-xs text-muted-foreground">unread messages</p>
          </Card>
        )}

        {/* Own account security: always visible to the signed-in user. */}
        <Card
          icon={
            securityStatus.mfaEnabled ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-yellow-600" />
            )
          }
          label="MFA status"
        >
          <div className="text-sm font-medium">{securityStatus.mfaEnabled ? "Enabled" : "Disabled"}</div>
          <p className="mt-1 text-xs text-muted-foreground">your account security</p>
        </Card>

        {canViewSecurityStatus && health && (
          <Card
            icon={
              health.database ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )
            }
            label="Database"
          >
            <div className="text-sm font-medium">{health.database ? "Connected" : "Offline"}</div>
            <p className="mt-1 text-xs text-muted-foreground">primary storage</p>
          </Card>
        )}

        {canViewSecurityStatus && (
          <Card
            icon={
              emailHealth?.canSend ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )
            }
            label="Email"
          >
            <div className="text-sm font-medium">{emailHealth?.canSend ? "Ready" : "Not configured"}</div>
            <p className="mt-1 text-xs text-muted-foreground">transactional mail</p>
          </Card>
        )}

        {canViewSecurityStatus && health && (
          <Card
            icon={
              health.redis ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-yellow-600" />
              )
            }
            label="Cache layer"
          >
            <div className="text-sm font-medium">{health.redis ? "Online" : "In-memory"}</div>
            <p className="mt-1 text-xs text-muted-foreground">session and rate limit storage</p>
          </Card>
        )}
      </div>

      {canViewAudit && activity.length > 0 && (
        <div className="rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-semibold">Recent activity</h2>
          <div className="space-y-3">
            {activity.map((entry) => (
              <div key={entry.id} className="flex gap-3 border-b py-2 text-sm last:border-0">
                <div className="flex-1">
                  <div className="font-medium text-foreground">{entry.action}</div>
                  <div className="text-xs text-muted-foreground">
                    {entry.actorEmail && `by ${entry.actorEmail}`}
                    {entry.entityType && ` on ${entry.entityType}`}
                  </div>
                </div>
                <div className="whitespace-nowrap text-xs text-muted-foreground">
                  {entry.createdAt.toLocaleDateString()} {entry.createdAt.toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border p-6">
      <div className="mb-2 flex items-center gap-3">
        {icon}
        <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
      </div>
      {children}
    </div>
  );
}
