// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useState } from "react";
import { Copy, Layers, MonitorCog, Plus, Terminal, Trash2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

import { cn } from "@/lib/utils";
import { actionCapabilityState, actionDisabledReason } from "@/lib/action-capabilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { EmptyState } from "@/components/empty-state";
import { InventoryLoadingState } from "@/components/inventory-loading-state";
import { StatusPill } from "@/components/status-pill";
import type { Status } from "@/components/status-dot";
import { DetailFieldList } from "./detail-fields";
import type { AzureBastionConnectResult, AzureBastionHost, WorkspaceSnapshot } from "@/types/backend";

export type AzurePageId = "overview" | "resource-groups" | "virtual-machines";

export type AzureVMAction = "start" | "powerOff" | "deallocate" | "restart";

export type AzureViewProps = {
  workspace: WorkspaceSnapshot;
  inventoryLoading?: boolean;
  /** Raw sub-page id from the nav; unknown values fall back to "overview". */
  activePageId: string;
  showSensitiveValues: boolean;
  actionStatus?: string;
  onSelectResourceGroup: (resourceGroup: string) => void;
  onSelectVirtualMachine: (vmId: string) => void;
  onCreateResourceGroup: (name: string, location: string) => void;
  onDeleteResourceGroup: (name: string) => void;
  onInvokeVMAction: (action: AzureVMAction, vmId: string) => void;
  onListBastionHosts: () => Promise<{ hosts: AzureBastionHost[]; statusMessage: string }>;
  onBastionConnect: (request: {
    bastionName: string;
    bastionResourceGroup: string;
    vmId: string;
    username: string;
    authType: string;
    sshKeyPath: string;
    launch: boolean;
  }) => Promise<AzureBastionConnectResult>;
};

function normalisePageId(pageId: string): AzurePageId {
  if (pageId === "resource-groups" || pageId === "virtual-machines") {
    return pageId;
  }
  return "overview";
}

/** Maps an Azure provisioning or power state onto the StatusPill palette. */
function azureStatus(value?: string): Status {
  const normalised = value?.toLowerCase() ?? "";
  if (normalised === "succeeded" || normalised === "running") {
    return "on";
  }
  if (normalised === "failed") {
    return "error";
  }
  if (
    normalised === "stopped" ||
    normalised === "deallocated" ||
    normalised === "creating" ||
    normalised === "updating"
  ) {
    return "warning";
  }
  return "off";
}

function normaliseVMPowerState(value?: string): string {
  const normalised = value?.toLowerCase() ?? "";
  if (normalised.includes("running")) {
    return "running";
  }
  if (normalised.includes("deallocat")) {
    return "deallocated";
  }
  if (normalised.includes("stop")) {
    return "stopped";
  }
  return normalised;
}

function profileFieldValue(
  profile: WorkspaceSnapshot["profile"],
  label: string,
): string | undefined {
  return profile?.attributes.find(
    (field) => field.label.toLowerCase() === label.toLowerCase(),
  )?.value;
}

function joinedValues(values: string[] | undefined, emptyText = "Unavailable"): string {
  return values && values.length > 0 ? values.join(", ") : emptyText;
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function copyToClipboard(value: string): void {
  if (navigator.clipboard) {
    void navigator.clipboard.writeText(value);
  }
}

function bastionHostKey(host: AzureBastionHost): string {
  return `${host.name}|${host.resourceGroup}`;
}

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

const snippetCard = "rounded-lg border border-border bg-muted/40 p-3";

/**
 * M5b Azure: Tailwind replacement for the Cloudscape Azure tabs. Subscription
 * overview, the read-only resource group inventory, and the virtual machine
 * explorer, switched by the contextual nav's sub-page id.
 */
export default function AzureView({
  workspace,
  inventoryLoading = false,
  activePageId,
  showSensitiveValues,
  actionStatus,
  onSelectResourceGroup,
  onSelectVirtualMachine,
  onCreateResourceGroup,
  onDeleteResourceGroup,
  onInvokeVMAction,
  onListBastionHosts,
  onBastionConnect,
}: AzureViewProps) {
  const page = normalisePageId(activePageId);
  const createRgCapability = actionCapabilityState(
    workspace,
    "resourceGroups",
    "createResourceGroup",
    "azure",
  );
  const deleteRgCapability = actionCapabilityState(
    workspace,
    "resourceGroups",
    "deleteResourceGroup",
    "azure",
  );
  const canWrite = createRgCapability.enabled;
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [pendingVmAction, setPendingVmAction] = useState<
    { action: AzureVMAction; vm: WorkspaceSnapshot["azureVirtualMachines"][number] } | undefined
  >();
  const [newRgName, setNewRgName] = useState("");
  const [newRgLocation, setNewRgLocation] = useState("westeurope");
  const [bastionHosts, setBastionHosts] = useState<AzureBastionHost[]>([]);
  const [bastionStatus, setBastionStatus] = useState("");
  const [bastionLoading, setBastionLoading] = useState(false);
  const [selectedBastionKey, setSelectedBastionKey] = useState("");
  const [bastionUsername, setBastionUsername] = useState("azureuser");
  const [bastionAuthType, setBastionAuthType] = useState("password");
  const [bastionSSHKeyPath, setBastionSSHKeyPath] = useState("");
  const [bastionCommand, setBastionCommand] = useState("");
  const [bastionPowerShellCommand, setBastionPowerShellCommand] = useState("");
  const [bastionConnectStatus, setBastionConnectStatus] = useState("");
  const [bastionConnecting, setBastionConnecting] = useState(false);

  const subscriptionId =
    profileFieldValue(workspace.profile, "Subscription ID") ||
    workspace.profile?.profileId;
  const tenantId = profileFieldValue(workspace.profile, "Tenant ID") || "Unavailable";
  const userName =
    profileFieldValue(workspace.profile, "User Name") ||
    profileFieldValue(workspace.profile, "User") ||
    "Unavailable";
  const authSummary =
    workspace.profile?.authMethods.find(
      (method) => method.method === workspace.authMethod,
    )?.summary || "The Azure auth path is ready for read-only workspace views.";

  const selectedResourceGroup = workspace.azureResourceGroups.find(
    (group) => group.name === workspace.selectedAzureResourceGroup,
  );
  const selectedVm =
    workspace.azureVirtualMachines.find(
      (vm) => vm.vmId === workspace.selectedAzureVmId,
    ) ?? workspace.azureVirtualMachines[0];
  const selectedVmPower = normaliseVMPowerState(selectedVm?.powerState);
  const startVmCapability = actionCapabilityState(workspace, "compute", "startVm", "azure");
  const stopVmCapability = actionCapabilityState(workspace, "compute", "stopVm", "azure");
  const deallocateVmCapability = actionCapabilityState(workspace, "compute", "deallocateVm", "azure");
  const restartVmCapability = actionCapabilityState(workspace, "compute", "restartVm", "azure");
  const canStartVm =
    startVmCapability.enabled &&
    (selectedVmPower === "stopped" || selectedVmPower === "deallocated");
  const canPowerOffVm = stopVmCapability.enabled && selectedVmPower === "running";
  const canDeallocateVm =
    deallocateVmCapability.enabled &&
    (selectedVmPower === "running" || selectedVmPower === "stopped");
  const canRestartVm = restartVmCapability.enabled && selectedVmPower === "running";
  const startVmDisabledReason = canStartVm
    ? undefined
    : actionDisabledReason(
        workspace,
        "compute",
        "startVm",
        !selectedVm
          ? "Select a virtual machine first."
          : selectedVmPower !== "stopped" && selectedVmPower !== "deallocated"
            ? "Start is only available when the VM is stopped or deallocated."
            : undefined,
        "azure",
      );
  const selectedBastion = bastionHosts.find(
    (host) => bastionHostKey(host) === selectedBastionKey,
  );
  const isWindowsVm = (selectedVm?.osType ?? "").toLowerCase() === "windows";

  useEffect(() => {
    if (page !== "virtual-machines") {
      return;
    }
    let cancelled = false;
    setBastionLoading(true);
    void onListBastionHosts()
      .then((result) => {
        if (cancelled) return;
        setBastionHosts(result.hosts);
        setBastionStatus(result.statusMessage);
        if (result.hosts.length > 0) {
          setSelectedBastionKey((current) => current || bastionHostKey(result.hosts[0]));
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setBastionStatus(error instanceof Error ? error.message : String(error));
        setBastionHosts([]);
      })
      .finally(() => {
        if (!cancelled) {
          setBastionLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [page, onListBastionHosts]);

  async function runBastionConnect(launch: boolean) {
    if (!selectedVm || !selectedBastion) {
      setBastionConnectStatus("Select a virtual machine and Bastion host first.");
      return;
    }
    setBastionConnecting(true);
    setBastionConnectStatus(launch ? "Launching Bastion session..." : "Building Bastion command...");
    try {
      const result = await onBastionConnect({
        bastionName: selectedBastion.name,
        bastionResourceGroup: selectedBastion.resourceGroup,
        vmId: selectedVm.vmId,
        username: bastionUsername,
        authType: bastionAuthType,
        sshKeyPath: bastionSSHKeyPath,
        launch,
      });
      setBastionCommand(result.command);
      setBastionPowerShellCommand(result.powershellCommand ?? "");
      setBastionConnectStatus(
        launch
          ? `Launched ${result.protocol?.toUpperCase() || "Bastion"} session in a new terminal.`
          : "Bastion commands ready to copy (cmd and PowerShell).",
      );
    } catch (error: unknown) {
      setBastionConnectStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBastionConnecting(false);
    }
  }

  const metricCards = [
    {
      label: "Workspace mode",
      value: canWrite ? "Writes on" : "Read-only",
      detail: workspace.azureWriteCapable
        ? canWrite
          ? `Mutating actions target ${workspace.azureEndpointUrl || "Azure CLI"}`
          : createRgCapability.reason || "Enable write mode from the top bar for create/delete actions"
        : "This profile is read-only in this release",
    },
    {
      label: "CLI readiness",
      value: workspace.provider?.commandPath ? "Azure CLI detected" : "CLI not detected",
      detail: workspace.provider?.commandPath || "Using local profile cache only",
    },
    {
      label: "Profile source",
      value: countLabel(workspace.profile?.sourcePaths.length || 0, "path", "paths"),
      detail: workspace.profile?.sourcePaths[0] || "No profile path recorded",
    },
    {
      label: "Next slices",
      value: "Resource Groups, VMs",
      detail: "Provider-aware inventory views are being added incrementally.",
    },
  ];

  const overviewPage = (
    <>
      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Azure Workspace</h2>
          <p className="text-sm text-muted-foreground">
            Read-only Azure workspace context for the open subscription.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Subscription</div>
            <p className="truncate text-sm font-bold">
              {workspace.profile?.displayName || "Unavailable"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {subscriptionId || "No subscription ID available"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Tenant</div>
            <p className="truncate text-sm font-bold">{tenantId}</p>
            <p className="truncate text-xs text-muted-foreground">User: {userName}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Auth path</div>
            <p className="truncate text-sm font-bold">
              {workspace.authMethod?.toUpperCase() || "Unavailable"}
            </p>
            <p className="truncate text-xs text-muted-foreground">{authSummary}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {metricCards.map((metric) => (
            <div
              key={metric.label}
              className="rounded-lg border border-border bg-card p-4 shadow-sm"
            >
              <div className={fieldLabel}>{metric.label}</div>
              <div className="mt-1 text-sm font-bold">{metric.value}</div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {metric.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Workspace Profile</h2>
          <p className="text-sm text-muted-foreground">
            The open workspace snapshot populates this profile detail.
          </p>
        </div>
        <DetailFieldList
          fields={workspace.profile?.attributes}
          emptyText="No open workspace profile is available yet."
          showSensitiveValues={showSensitiveValues}
        />
      </section>

      {workspace.azureStatusMessage ? (
        <p className="text-sm text-muted-foreground">{workspace.azureStatusMessage}</p>
      ) : null}
    </>
  );

  const inventoryStatusRow = (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
        <div className={fieldLabel}>Resource Groups</div>
        <p className="truncate text-sm">
          {countLabel(workspace.azureResourceGroups.length, "group", "groups")}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
        <div className={fieldLabel}>Selected Group</div>
        <p className="truncate text-sm">
          {workspace.selectedAzureResourceGroup || "No resource group selected"}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
        <div className={fieldLabel}>Virtual Machines</div>
        <p className="truncate text-sm">
          {countLabel(workspace.azureVirtualMachines.length, "VM", "VMs")}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
        <div className={fieldLabel}>Selected VM</div>
        <p className="truncate text-sm">{selectedVm?.name || "No VM selected"}</p>
      </div>
    </div>
  );

  const resourceGroupsPage = (
    <>
      <section className={sectionCard}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Azure Resource Groups</h2>
            <p className="text-sm text-muted-foreground">
              Browse resource groups discovered for the open Azure subscription.
            </p>
          </div>
          {canWrite ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              Create group
            </Button>
          ) : null}
        </div>
        {inventoryStatusRow}
        {inventoryLoading ? (
          <InventoryLoadingState
            variant="inline"
            label={
              workspace.azureStatusMessage || "Loading Azure resource groups..."
            }
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {workspace.azureStatusMessage ||
              "Azure inventory is waiting for an open Azure workspace."}
          </p>
        )}
        {actionStatus ? (
          <p className="text-sm text-muted-foreground">{actionStatus}</p>
        ) : null}
        <div className="overflow-hidden rounded-lg border border-border">
          {inventoryLoading && workspace.azureResourceGroups.length === 0 ? (
            <InventoryLoadingState
              label={workspace.azureStatusMessage || "Loading resource groups..."}
              className="border-0 bg-transparent"
            />
          ) : workspace.azureResourceGroups.length === 0 ? (
            <EmptyState
              icon={<Layers />}
              title="No resource groups"
              description="No Azure resource groups were returned for this subscription."
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Provisioning</TableHead>
                  <TableHead>Managed By</TableHead>
                  {canWrite ? <TableHead className="w-20" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {workspace.azureResourceGroups.map((group) => {
                  const active = group.name === workspace.selectedAzureResourceGroup;
                  return (
                    <TableRow
                      key={group.name}
                      data-state={active ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={() => {
                        onSelectResourceGroup(group.name);
                      }}
                    >
                      <TableCell className="font-medium">{group.name}</TableCell>
                      <TableCell>{group.location || "Unknown"}</TableCell>
                      <TableCell>
                        <StatusPill
                          status={azureStatus(group.provisioningState)}
                          label={group.provisioningState || "Unknown"}
                        />
                      </TableCell>
                      <TableCell>{group.managedBy || "Direct subscription resource"}</TableCell>
                      {canWrite ? (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Delete ${group.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteTarget(group.name);
                            }}
                          >
                            <Trash2 />
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Resource Group Detail</h2>
          <p className="text-sm text-muted-foreground">
            {workspace.selectedAzureResourceGroup || "Select a resource group for detail."}
          </p>
        </div>
        {workspace.selectedAzureResourceGroup ? (
          <DetailFieldList
            fields={[
              {
                label: "Name",
                value: selectedResourceGroup?.name || workspace.selectedAzureResourceGroup,
              },
              { label: "Location", value: selectedResourceGroup?.location || "Unknown" },
              {
                label: "Provisioning State",
                value: selectedResourceGroup?.provisioningState || "Unknown",
              },
              {
                label: "Managed By",
                value: selectedResourceGroup?.managedBy || "Direct subscription resource",
              },
              {
                label: "Tags",
                value: joinedValues(
                  selectedResourceGroup?.tags?.map((tag) => `${tag.label}=${tag.value}`),
                  "No tags returned",
                ),
              },
            ]}
            emptyText="No resource group details are available."
          />
        ) : (
          <p className="text-sm text-muted-foreground">No Azure resource group selected.</p>
        )}
      </section>
    </>
  );

  const vmCopySnippets = selectedVm
    ? [
        {
          label: "Azure CLI show command",
          value: `az vm show --subscription ${
            workspace.profile?.profileId || "<subscription>"
          } --resource-group ${
            selectedVm.resourceGroup ||
            workspace.selectedAzureResourceGroup ||
            "<resource-group>"
          } --name ${selectedVm.name}`,
        },
        {
          label: "Virtual machine JSON",
          value: JSON.stringify(selectedVm, null, 2),
        },
      ]
    : [];

  const virtualMachinesPage = (
    <>
      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Azure Virtual Machines</h2>
          <p className="text-sm text-muted-foreground">
            Select a resource group, then browse its Azure virtual machines.
          </p>
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
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!canStartVm || !selectedVm}
              title={startVmDisabledReason}
              onClick={() => {
                if (selectedVm) {
                  setPendingVmAction({ action: "start", vm: selectedVm });
                }
              }}
            >
              Start
            </Button>
            <Button
              variant="outline"
              disabled={!canPowerOffVm || !selectedVm}
              onClick={() => {
                if (selectedVm) {
                  setPendingVmAction({ action: "powerOff", vm: selectedVm });
                }
              }}
            >
              Power off
            </Button>
            <Button
              variant="outline"
              disabled={!canDeallocateVm || !selectedVm}
              onClick={() => {
                if (selectedVm) {
                  setPendingVmAction({ action: "deallocate", vm: selectedVm });
                }
              }}
            >
              Deallocate
            </Button>
            <Button
              variant="outline"
              disabled={!canRestartVm || !selectedVm}
              onClick={() => {
                if (selectedVm) {
                  setPendingVmAction({ action: "restart", vm: selectedVm });
                }
              }}
            >
              Restart
            </Button>
          </div>
          <div className="pb-2 text-xs text-muted-foreground">
            {countLabel(workspace.azureVirtualMachines.length, "VM", "VMs")}
          </div>
        </div>
        {inventoryLoading ? (
          <InventoryLoadingState
            variant="inline"
            label={workspace.azureStatusMessage || "Loading virtual machines..."}
          />
        ) : null}
        {actionStatus ? <p className="text-sm text-muted-foreground">{actionStatus}</p> : null}
        <div className="overflow-hidden rounded-lg border border-border">
          {inventoryLoading && workspace.azureVirtualMachines.length === 0 ? (
            <InventoryLoadingState
              label={workspace.azureStatusMessage || "Loading virtual machines..."}
              className="border-0 bg-transparent"
            />
          ) : workspace.azureVirtualMachines.length === 0 ? (
            <EmptyState
              icon={<MonitorCog />}
              title="No virtual machines"
              description="No Azure virtual machines loaded for the selected resource group."
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Power State</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>Private IP</TableHead>
                  <TableHead>Public IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workspace.azureVirtualMachines.map((vm) => {
                  const active = vm.vmId === selectedVm?.vmId;
                  return (
                    <TableRow
                      key={vm.vmId}
                      data-state={active ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={() => {
                        onSelectVirtualMachine(vm.vmId);
                      }}
                    >
                      <TableCell className="font-medium">{vm.name}</TableCell>
                      <TableCell>
                        <StatusPill
                          status={azureStatus(vm.powerState)}
                          label={vm.powerState || "Unknown"}
                        />
                      </TableCell>
                      <TableCell>{vm.size || "Unknown"}</TableCell>
                      <TableCell>{vm.osType || "Unknown"}</TableCell>
                      <TableCell>{vm.privateIp || "Unavailable"}</TableCell>
                      <TableCell>{vm.publicIp || "Unavailable"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={sectionCard}>
          <div>
            <h2 className="text-base font-bold">Virtual Machine Detail</h2>
            <p className="text-sm text-muted-foreground">
              {selectedVm?.vmId || "Select a virtual machine for detail."}
            </p>
          </div>
          {inventoryLoading ? (
            <InventoryLoadingState
              variant="inline"
              label="Loading virtual machine details..."
            />
          ) : selectedVm ? (
            <DetailFieldList
              fields={[
                { label: "Name", value: selectedVm.name },
                { label: "Resource Group", value: selectedVm.resourceGroup || "Unknown" },
                { label: "Power State", value: selectedVm.powerState || "Unknown" },
                {
                  label: "Provisioning State",
                  value: selectedVm.provisioningState || "Unknown",
                },
                { label: "Size", value: selectedVm.size || "Unknown" },
                { label: "OS Type", value: selectedVm.osType || "Unknown" },
                { label: "Location", value: selectedVm.location || "Unknown" },
                { label: "Private IP", value: selectedVm.privateIp || "Unavailable" },
                { label: "Public IP", value: selectedVm.publicIp || "Unavailable" },
                {
                  label: "Tags",
                  value: joinedValues(
                    selectedVm.tags?.map((tag) => `${tag.label}=${tag.value}`),
                    "No tags returned",
                  ),
                },
              ]}
              emptyText="No virtual machine details are available."
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No Azure virtual machine selected.
            </p>
          )}
        </section>

        <section className={sectionCard}>
          <div>
            <h2 className="text-base font-bold">Copy Actions</h2>
            <p className="text-sm text-muted-foreground">
              Generated locally for the selected Azure VM. No data is persisted beyond the
              current snapshot.
            </p>
          </div>
          {vmCopySnippets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Select a virtual machine to generate copy actions.
            </p>
          ) : (
            <div className="space-y-3">
              {vmCopySnippets.map((snippet) => (
                <div key={snippet.label} className={snippetCard}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={fieldLabel}>{snippet.label}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        copyToClipboard(snippet.value);
                      }}
                    >
                      <Copy />
                      Copy
                    </Button>
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs">{snippet.value}</pre>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className={sectionCard}>
        <div className="flex items-start gap-3">
          <Terminal className="mt-0.5 size-5 text-muted-foreground" />
          <div className="space-y-1">
            <h2 className="text-base font-bold">Bastion connect</h2>
            <p className="text-sm text-muted-foreground">
              Native-client SSH or RDP via <span className="font-mono">az network bastion</span>. Requires
              Bastion Standard with native client support enabled.
            </p>
          </div>
        </div>
        {bastionLoading ? (
          <InventoryLoadingState variant="inline" label="Loading Bastion hosts..." />
        ) : bastionHosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {bastionStatus || "No Bastion hosts are available for this subscription."}
          </p>
        ) : !selectedVm ? (
          <p className="text-sm text-muted-foreground">Select a virtual machine to connect.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <div className={cn(fieldLabel, "mb-1")}>Bastion host</div>
                <Select value={selectedBastionKey} onValueChange={setSelectedBastionKey}>
                  <SelectTrigger aria-label="Select Bastion host">
                    <SelectValue placeholder="Select Bastion host" />
                  </SelectTrigger>
                  <SelectContent>
                    {bastionHosts.map((host) => (
                      <SelectItem key={bastionHostKey(host)} value={bastionHostKey(host)}>
                        {host.name} ({host.resourceGroup})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!isWindowsVm ? (
                <>
                  <div>
                    <div className={cn(fieldLabel, "mb-1")}>SSH username</div>
                    <Input
                      value={bastionUsername}
                      onChange={(event) => setBastionUsername(event.target.value)}
                      spellCheck={false}
                    />
                  </div>
                  <div>
                    <div className={cn(fieldLabel, "mb-1")}>Auth type</div>
                    <Select value={bastionAuthType} onValueChange={setBastionAuthType}>
                      <SelectTrigger aria-label="Select Bastion auth type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="password">Password</SelectItem>
                        <SelectItem value="ssh-key">SSH key file</SelectItem>
                        <SelectItem value="aad">Microsoft Entra ID</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                  Windows VM selected: Bastion will launch native RDP via the Azure CLI.
                </div>
              )}
            </div>
            {!isWindowsVm && bastionAuthType === "ssh-key" ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[280px] flex-1">
                  <div className={cn(fieldLabel, "mb-1")}>SSH private key path</div>
                  <Input
                    value={bastionSSHKeyPath}
                    onChange={(event) => setBastionSSHKeyPath(event.target.value)}
                    placeholder="C:\\Users\\you\\.ssh\\id_rsa"
                    spellCheck={false}
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    void open({ multiple: false, directory: false }).then((path) => {
                      if (typeof path === "string") {
                        setBastionSSHKeyPath(path);
                      }
                    });
                  }}
                >
                  Browse
                </Button>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={bastionConnecting || !selectedBastion}
                onClick={() => {
                  void runBastionConnect(false);
                }}
              >
                Build commands
              </Button>
              <Button
                disabled={bastionConnecting || !selectedBastion}
                onClick={() => {
                  void runBastionConnect(true);
                }}
              >
                Connect in terminal
              </Button>
              {bastionCommand ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    copyToClipboard(bastionCommand);
                  }}
                >
                  <Copy />
                  Copy cmd
                </Button>
              ) : null}
              {bastionPowerShellCommand ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    copyToClipboard(bastionPowerShellCommand);
                  }}
                >
                  <Copy />
                  Copy PowerShell
                </Button>
              ) : null}
            </div>
            {bastionConnectStatus ? (
              <p className="text-sm text-muted-foreground">{bastionConnectStatus}</p>
            ) : null}
            {bastionCommand ? (
              <div className="space-y-2">
                <div className={cn(fieldLabel)}>Command Prompt (cmd.exe)</div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs">
                  {bastionCommand}
                </pre>
              </div>
            ) : null}
            {bastionPowerShellCommand ? (
              <div className="space-y-2">
                <div className={cn(fieldLabel)}>PowerShell</div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs">
                  {bastionPowerShellCommand}
                </pre>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </>
  );

  const pageTitles: Record<AzurePageId, string> = {
    overview: "Overview",
    "resource-groups": "Resource Groups",
    "virtual-machines": "Virtual Machines",
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Azure</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspace.profile?.displayName || "Subscription"} · {pageTitles[page]}
        </p>
      </header>
      {page === "overview" ? overviewPage : null}
      {page === "resource-groups" ? resourceGroupsPage : null}
      {page === "virtual-machines" ? virtualMachinesPage : null}

      <AlertDialog open={createOpen} onOpenChange={setCreateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create resource group</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div>
                  <div className={fieldLabel}>Name</div>
                  <Input
                    value={newRgName}
                    onChange={(event) => setNewRgName(event.target.value)}
                    placeholder="my-resource-group"
                  />
                </div>
                <div>
                  <div className={fieldLabel}>Location</div>
                  <Input
                    value={newRgLocation}
                    onChange={(event) => setNewRgLocation(event.target.value)}
                    placeholder="westeurope"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!newRgName.trim()}
              onClick={() => {
                onCreateResourceGroup(newRgName.trim(), newRgLocation.trim() || "westeurope");
                setNewRgName("");
                setCreateOpen(false);
              }}
            >
              Create
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingVmAction)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingVmAction(undefined);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingVmAction?.action === "powerOff"
                ? "Power off"
                : pendingVmAction?.action === "deallocate"
                  ? "Deallocate"
                  : pendingVmAction?.action === "restart"
                    ? "Restart"
                    : "Start"}{" "}
              virtual machine
            </AlertDialogTitle>
            <AlertDialogDescription>
              This sends a live Azure VM {pendingVmAction?.action} request for the selected machine.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingVmAction) {
                  onInvokeVMAction(pendingVmAction.action, pendingVmAction.vm.vmId);
                }
                setPendingVmAction(undefined);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete resource group?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes <strong>{deleteTarget}</strong> and its resources. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  onDeleteResourceGroup(deleteTarget);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
