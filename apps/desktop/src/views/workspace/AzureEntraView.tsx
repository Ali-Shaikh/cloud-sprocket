import { Users } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import type { WorkspaceSnapshot } from "@/types/backend";

export type AzureEntraViewProps = {
  workspace: WorkspaceSnapshot;
};

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

function profileFieldValue(profile: WorkspaceSnapshot["profile"], label: string): string | undefined {
  return profile?.attributes.find((field) => field.label.toLowerCase() === label.toLowerCase())?.value;
}

function isLocalFlociProfile(workspace: WorkspaceSnapshot): boolean {
  return profileFieldValue(workspace.profile, "Tenant ID") === "cloudsprocket-local";
}

export default function AzureEntraView({ workspace }: AzureEntraViewProps) {
  const users = workspace.azureEntraUsers ?? [];
  const groups = workspace.azureEntraGroups ?? [];
  const apps = workspace.azureEntraApps ?? [];

  if (isLocalFlociProfile(workspace)) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Entra ID</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {workspace.profile?.displayName || "Subscription"} · Not available locally
          </p>
        </header>
        <EmptyState
          icon={<Users />}
          title="Directory is cloud-only"
          description="floci-az emulates the Entra token/OIDC plane only, not the Microsoft Graph directory. Switch to a cloud Azure profile to browse users, groups, and app registrations."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Entra ID</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspace.profile?.displayName || "Subscription"} · Directory
        </p>
      </header>

      <p className="text-sm text-muted-foreground">{workspace.azureEntraStatusMessage}</p>

      <section className={sectionCard}>
        <h2 className="text-base font-bold">Users</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          {users.length === 0 ? (
            <EmptyState icon={<Users />} title="No users" description="No directory users were returned." className="border-0" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Display name</TableHead>
                  <TableHead>User principal name</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id || user.userPrincipalName || user.displayName}>
                    <TableCell className="font-medium">{user.displayName}</TableCell>
                    <TableCell className="font-mono text-xs">{user.userPrincipalName || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <section className={sectionCard}>
        <h2 className="text-base font-bold">Groups</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          {groups.length === 0 ? (
            <EmptyState icon={<Users />} title="No groups" description="No directory groups were returned." className="border-0" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Display name</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.id || group.displayName}>
                    <TableCell className="font-medium">{group.displayName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <section className={sectionCard}>
        <h2 className="text-base font-bold">App registrations</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          {apps.length === 0 ? (
            <EmptyState icon={<Users />} title="No app registrations" description="No app registrations were returned." className="border-0" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Display name</TableHead>
                  <TableHead>App ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apps.map((app) => (
                  <TableRow key={app.appId || app.displayName}>
                    <TableCell className="font-medium">{app.displayName}</TableCell>
                    <TableCell className="font-mono text-xs">{app.appId || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
