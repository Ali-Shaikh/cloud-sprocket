// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useState } from "react";
import { Globe, Plus, RotateCw, Square, Play } from "lucide-react";

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
import { InventoryLoadingState } from "@/components/inventory-loading-state";
import { StatusPill } from "@/components/status-pill";
import type { Status } from "@/components/status-dot";
import { DetailFieldList } from "./detail-fields";
import type { AzureWebAppAction, WorkspaceSnapshot } from "@/types/backend";

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

function isSensitiveSettingName(name: string): boolean {
  const upper = name.toUpperCase();
  return (
    upper.includes("SECRET") ||
    upper.includes("PASSWORD") ||
    upper.includes("KEY") ||
    upper.includes("TOKEN") ||
    upper.includes("CONNECTION")
  );
}

function maskSettingValue(name: string, value: string): string {
  if (!value || !isSensitiveSettingName(name)) {
    return value || "—";
  }
  return "••••••••";
}

export type AzureAppServiceViewProps = {
  workspace: WorkspaceSnapshot;
  inventoryLoading?: boolean;
  actionStatus?: string;
  onSelectResourceGroup: (resourceGroup: string) => void;
  onSelectWebApp: (appName: string) => void;
  onCreateWebApp: (resourceGroup: string, appName: string, location: string, runtime: string) => void;
  onInvokeAction: (action: AzureWebAppAction, appName: string) => void;
  onSetSetting: (
    appName: string,
    name: string,
    value: string,
    slotSetting: boolean,
  ) => Promise<void>;
  onDeleteSetting: (appName: string, name: string) => Promise<void>;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

export default function AzureAppServiceView({
  workspace,
  inventoryLoading = false,
  actionStatus,
  onSelectResourceGroup,
  onSelectWebApp,
  onCreateWebApp,
  onInvokeAction,
  onSetSetting,
  onDeleteSetting,
}: AzureAppServiceViewProps) {
  const localProfile = isLocalFlociProfile(workspace);
  const canWrite = workspace.azureWritesEnabled && !localProfile;
  const [createOpen, setCreateOpen] = useState(false);
  const [settingDialogOpen, setSettingDialogOpen] = useState(false);
  const [settingDialogMode, setSettingDialogMode] = useState<"add" | "edit">("add");
  const [settingName, setSettingName] = useState("");
  const [settingValue, setSettingValue] = useState("");
  const [settingSlotSetting, setSettingSlotSetting] = useState(false);
  const [settingError, setSettingError] = useState<string | null>(null);
  const [pendingDeleteSetting, setPendingDeleteSetting] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<AzureWebAppAction | null>(null);
  const [newAppName, setNewAppName] = useState("");
  const [newAppLocation, setNewAppLocation] = useState("westeurope");
  const [newAppRuntime, setNewAppRuntime] = useState("NODE:22-lts");
  const [createResourceGroup, setCreateResourceGroup] = useState(
    workspace.selectedAzureResourceGroup ?? "",
  );

  const selectedApp = workspace.azureWebApps.find(
    (app) => app.name === workspace.selectedAzureWebAppName,
  );
  const plans = workspace.azureAppServicePlans ?? [];
  const settings = workspace.azureWebAppSettings ?? [];

  function openAddSettingDialog() {
    setSettingDialogMode("add");
    setSettingName("");
    setSettingValue("");
    setSettingSlotSetting(false);
    setSettingError(null);
    setSettingDialogOpen(true);
  }

  function openEditSettingDialog(name: string, slotSetting: boolean) {
    setSettingDialogMode("edit");
    setSettingName(name);
    setSettingValue("");
    setSettingSlotSetting(slotSetting);
    setSettingError(null);
    setSettingDialogOpen(true);
  }

  async function confirmSetSetting() {
    if (!selectedApp) return;
    const name = settingName.trim();
    if (!name) {
      setSettingError("Setting name is required.");
      return;
    }
    setSettingError(null);
    try {
      await onSetSetting(selectedApp.name, name, settingValue, settingSlotSetting);
      setSettingDialogOpen(false);
    } catch (caught) {
      setSettingError(caught instanceof Error ? caught.message : String(caught));
    }
  }

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
              disabled={inventoryLoading}
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
        {inventoryLoading ? (
          <InventoryLoadingState
            variant="inline"
            label={
              workspace.azureAppServiceStatusMessage || "Loading App Service web apps..."
            }
          />
        ) : (
          <p className="text-sm text-muted-foreground">{workspace.azureAppServiceStatusMessage}</p>
        )}
        {actionStatus ? <p className="text-sm text-muted-foreground">{actionStatus}</p> : null}
        <div className="overflow-hidden rounded-lg border border-border">
          {inventoryLoading && workspace.azureWebApps.length === 0 ? (
            <InventoryLoadingState
              label={
                workspace.azureAppServiceStatusMessage || "Loading App Service web apps..."
              }
              className="border-0 bg-transparent"
            />
          ) : workspace.azureWebApps.length === 0 ? (
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-base font-bold">Web app detail</h2>
          {selectedApp && canWrite ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={selectedApp.state?.toLowerCase() === "running"}
                onClick={() => setPendingAction("start")}
              >
                <Play />
                Start
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={selectedApp.state?.toLowerCase() === "stopped"}
                onClick={() => setPendingAction("stop")}
              >
                <Square />
                Stop
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPendingAction("restart")}>
                <RotateCw />
                Restart
              </Button>
            </div>
          ) : null}
        </div>
        {inventoryLoading ? (
          <InventoryLoadingState variant="inline" label="Loading web app details..." />
        ) : selectedApp ? (
          <DetailFieldList
            fields={[
              { label: "Name", value: selectedApp.name },
              { label: "Resource group", value: selectedApp.resourceGroup || "Unknown" },
              { label: "State", value: selectedApp.state || "Unknown" },
              { label: "Location", value: selectedApp.location || "Unknown" },
              { label: "Default hostname", value: selectedApp.defaultHostName || "Unavailable" },
              { label: "Kind", value: selectedApp.kind || "Unknown" },
              { label: "HTTPS only", value: selectedApp.httpsOnly ? "Yes" : "No" },
              { label: "App Service plan", value: selectedApp.appServicePlan || "Unknown" },
              { label: "Plan SKU", value: selectedApp.planSku || "Unknown" },
              { label: "Runtime", value: selectedApp.runtime || "Unknown" },
              { label: "Outbound IPs", value: selectedApp.outboundIpAddresses || "Unknown" },
              { label: "Managed identity", value: selectedApp.identityType || "None" },
              {
                label: "Identity principal ID",
                value: selectedApp.identityPrincipalId || "—",
              },
            ]}
            emptyText="No web app details are available."
          />
        ) : (
          <p className="text-sm text-muted-foreground">Select a web app to inspect details.</p>
        )}
      </section>

      <section className={sectionCard}>
        <h2 className="text-base font-bold">App Service plans</h2>
        <p className="text-sm text-muted-foreground">
          Plans in the selected resource group (read-only).
        </p>
        {inventoryLoading ? (
          <InventoryLoadingState variant="inline" label="Loading App Service plans..." />
        ) : plans.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Workers</TableHead>
                <TableHead>Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => (
                <TableRow key={plan.name}>
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell>{plan.sku || "—"}</TableCell>
                  <TableCell>{plan.status || "—"}</TableCell>
                  <TableCell>{plan.numberOfWorkers ?? "—"}</TableCell>
                  <TableCell>{plan.location || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No App Service plans returned.</p>
        )}
      </section>

      <section className={sectionCard}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Application settings</h2>
            <p className="text-sm text-muted-foreground">
              On container web apps these settings are exposed as environment variables. Updates
              trigger an app recycle. Sensitive names are masked in the table.
            </p>
          </div>
          {selectedApp && canWrite ? (
            <Button variant="outline" size="sm" onClick={openAddSettingDialog}>
              <Plus />
              Add setting
            </Button>
          ) : null}
        </div>
        {settingError ? <p className="text-sm text-destructive">{settingError}</p> : null}
        {inventoryLoading ? (
          <InventoryLoadingState variant="inline" label="Loading application settings..." />
        ) : !selectedApp ? (
          <p className="text-sm text-muted-foreground">Select a web app to view settings.</p>
        ) : settings.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Slot setting</TableHead>
                {canWrite ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.map((setting) => (
                <TableRow key={setting.name}>
                  <TableCell className="font-mono text-xs">{setting.name}</TableCell>
                  <TableCell className="max-w-[360px] truncate font-mono text-xs">
                    {maskSettingValue(setting.name, setting.value)}
                  </TableCell>
                  <TableCell>{setting.slotSetting ? "Yes" : "No"}</TableCell>
                  {canWrite ? (
                    <TableCell className="space-x-2 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditSettingDialog(setting.name, setting.slotSetting ?? false)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPendingDeleteSetting(setting.name)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No application settings returned.</p>
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

      <AlertDialog open={settingDialogOpen} onOpenChange={setSettingDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {settingDialogMode === "add" ? "Add application setting" : "Update application setting"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Applies to {selectedApp?.name ?? "the selected web app"}. Container apps receive
                  these as environment variables.
                </p>
                <div>
                  <div className={fieldLabel}>Name</div>
                  <Input
                    value={settingName}
                    onChange={(event) => setSettingName(event.target.value)}
                    placeholder="MY_ENV_VAR"
                    disabled={settingDialogMode === "edit"}
                    spellCheck={false}
                  />
                </div>
                <div>
                  <div className={fieldLabel}>Value</div>
                  <Input
                    value={settingValue}
                    onChange={(event) => setSettingValue(event.target.value)}
                    placeholder={settingDialogMode === "edit" ? "Enter new value" : "value"}
                    spellCheck={false}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settingSlotSetting}
                    onChange={(event) => setSettingSlotSetting(event.target.checked)}
                  />
                  Deployment slot setting (sticky per slot)
                </label>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!settingName.trim()}
              onClick={() => void confirmSetSetting()}
            >
              {settingDialogMode === "add" ? "Add" : "Update"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDeleteSetting != null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteSetting(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete application setting?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {pendingDeleteSetting} from {selectedApp?.name}. This triggers an app recycle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteSetting && selectedApp) {
                  void onDeleteSetting(selectedApp.name, pendingDeleteSetting).catch((caught: unknown) => {
                    setSettingError(caught instanceof Error ? caught.message : String(caught));
                  });
                }
                setPendingDeleteSetting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingAction != null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingAction(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction === "start"
                ? "Start"
                : pendingAction === "stop"
                  ? "Stop"
                  : "Restart"}{" "}
              web app
            </AlertDialogTitle>
            <AlertDialogDescription>
              This sends a live Azure App Service {pendingAction} request for{" "}
              {selectedApp?.name ?? "the selected web app"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingAction && selectedApp) {
                  onInvokeAction(pendingAction, selectedApp.name);
                }
                setPendingAction(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}