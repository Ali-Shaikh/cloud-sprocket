import { useState } from "react";
import { Globe, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import type { Status } from "@/components/status-dot";
import { DetailFieldList } from "./detail-fields";
import type { WorkspaceSnapshot } from "@/types/backend";

function profileFieldValue(
  profile: WorkspaceSnapshot["profile"],
  label: string,
): string | undefined {
  return profile?.attributes.find(
    (field) => field.label.toLowerCase() === label.toLowerCase(),
  )?.value;
}

function isLocalFlociProfile(workspace: WorkspaceSnapshot): boolean {
  const tenantId = profileFieldValue(workspace.profile, "Tenant ID");
  return tenantId === "cloudsprocket-local";
}

function appStatus(value?: string): Status {
  const normalised = value?.toLowerCase() ?? "";
  if (normalised === "running") {
    return "on";
  }
  if (normalised === "stopped") {
    return "warning";
  }
  return "off";
}

export type AzureAppServiceViewProps = {
  workspace: WorkspaceSnapshot;
  actionStatus?: string;
  onSelectResourceGroup: (resourceGroup: string) => void;
  onSelectWebApp: (appName: string) => void;
  onCreateWebApp: (resourceGroup: string, appName: string, location: string, runtime: string) => void;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

export default function AzureAppServiceView({
  workspace,
  actionStatus,
  onSelectResourceGroup,
  onSelectWebApp,
  onCreateWebApp,
}: AzureAppServiceViewProps) {
  const localProfile = isLocalFlociProfile(workspace);
  const canWrite = workspace.azureWritesEnabled && !localProfile;
  const [createOpen, setCreateOpen] = useState(false);
  const [newAppName, setNewAppName] = useState("");
  const [newAppLocation, setNewAppLocation] = useState("westeurope");
  const [newAppRuntime, setNewAppRuntime] = useState("NODE:22-lts");
  const [createResourceGroup, setCreateResourceGroup] = useState(
    workspace.selectedAzureResourceGroup ?? "",
  );

  const selectedApp = workspace.azureWebApps.find(
    (app) => app.name === workspace.selectedAzureWebAppName,
  );

  if (localProfile) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">App Service</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {workspace.profile?.displayName || "Subscription"} · Not available locally
          </p>
        </header>
        <EmptyState
          icon={<Globe />}
          title="App Service is cloud-only"
          description="floci-az does not emulate Microsoft.Web. Switch to a cloud Azure profile to browse or create App Service web apps, or use Azure Functions on the local emulator."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">App Service</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspace.profile?.displayName || "Subscription"} · Web apps
        </p>
      </header>

      <section className={sectionCard}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Web apps</h2>
            <p className="text-sm text-muted-foreground">
              Browse App Service web apps for the selected resource group.
            </p>
          </div>
          {canWrite ? (
            <Button
              onClick={() => {
                setCreateResourceGroup(workspace.selectedAzureResourceGroup ?? "");
                setCreateOpen(true);
              }}
            >
              <Plus />
              Create web app
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64">
            <div className={cn(fieldLabel, "mb-1")}>Resource group</div>
            <Select
              value={workspace.selectedAzureResourceGroup ?? ""}
              onValueChange={(value) => {
                if (value) {
                  onSelectResourceGroup(value);
                }
              }}
            >
              <SelectTrigger aria-label="Select resource group">
                <SelectValue placeholder="Select resource group" />
              </SelectTrigger>
              <SelectContent>
                {workspace.azureResourceGroups.map((group) => (
                  <SelectItem key={group.name} value={group.name}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <StatusPill
            status={canWrite ? "on" : "warning"}
            label={canWrite ? "Writes enabled" : "Read-only"}
          />
        </div>
        <p className="text-sm text-muted-foreground">{workspace.azureAppServiceStatusMessage}</p>
        {actionStatus ? <p className="text-sm text-muted-foreground">{actionStatus}</p> : null}
        <div className="overflow-hidden rounded-lg border border-border">
          {workspace.azureWebApps.length === 0 ? (
            <EmptyState
              icon={<Globe />}
              title="No web apps"
              description="No App Service web apps were returned for the selected resource group."
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Default hostname</TableHead>
                  <TableHead>Kind</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workspace.azureWebApps.map((app) => {
                  const active = app.name === workspace.selectedAzureWebAppName;
                  return (
                    <TableRow
                      key={app.name}
                      data-state={active ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={() => onSelectWebApp(app.name)}
                    >
                      <TableCell className="font-medium">{app.name}</TableCell>
                      <TableCell>
                        <StatusPill status={appStatus(app.state)} label={app.state || "Unknown"} />
                      </TableCell>
                      <TableCell>{app.location || "Unknown"}</TableCell>
                      <TableCell className="max-w-[240px] truncate font-mono text-xs">
                        {app.defaultHostName || "Unavailable"}
                      </TableCell>
                      <TableCell>{app.kind || "Unknown"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <section className={sectionCard}>
        <h2 className="text-base font-bold">Web app detail</h2>
        {selectedApp ? (
          <DetailFieldList
            fields={[
              { label: "Name", value: selectedApp.name },
              { label: "Resource group", value: selectedApp.resourceGroup || "Unknown" },
              { label: "State", value: selectedApp.state || "Unknown" },
              { label: "Location", value: selectedApp.location || "Unknown" },
              { label: "Default hostname", value: selectedApp.defaultHostName || "Unavailable" },
              { label: "Kind", value: selectedApp.kind || "Unknown" },
              { label: "HTTPS only", value: selectedApp.httpsOnly ? "Yes" : "No" },
            ]}
            emptyText="No web app details are available."
          />
        ) : (
          <p className="text-sm text-muted-foreground">Select a web app to inspect details.</p>
        )}
      </section>

      <AlertDialog open={createOpen} onOpenChange={setCreateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create web app</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div>
                  <div className={fieldLabel}>Resource group</div>
                  <Select value={createResourceGroup} onValueChange={setCreateResourceGroup}>
                    <SelectTrigger aria-label="Resource group for new web app">
                      <SelectValue placeholder="Select resource group" />
                    </SelectTrigger>
                    <SelectContent>
                      {workspace.azureResourceGroups.map((group) => (
                        <SelectItem key={group.name} value={group.name}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className={fieldLabel}>App name</div>
                  <Input
                    value={newAppName}
                    onChange={(event) => setNewAppName(event.target.value)}
                    placeholder="my-web-app"
                  />
                </div>
                <div>
                  <div className={fieldLabel}>Location</div>
                  <Input
                    value={newAppLocation}
                    onChange={(event) => setNewAppLocation(event.target.value)}
                    placeholder="westeurope"
                  />
                </div>
                <div>
                  <div className={fieldLabel}>Runtime</div>
                  <Input
                    value={newAppRuntime}
                    onChange={(event) => setNewAppRuntime(event.target.value)}
                    placeholder="NODE:22-lts"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!createResourceGroup.trim() || !newAppName.trim()}
              onClick={() => {
                onCreateWebApp(
                  createResourceGroup.trim(),
                  newAppName.trim(),
                  newAppLocation.trim() || "westeurope",
                  newAppRuntime.trim() || "NODE:22-lts",
                );
                setNewAppName("");
                setCreateOpen(false);
              }}
            >
              Create
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}