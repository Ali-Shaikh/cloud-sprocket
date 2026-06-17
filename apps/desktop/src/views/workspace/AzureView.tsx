import { useState } from "react";
import { Copy, Layers, MonitorCog, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
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
import { StatusPill } from "@/components/status-pill";
import type { Status } from "@/components/status-dot";
import { DetailFieldList } from "./detail-fields";
import type { WorkspaceSnapshot } from "@/types/backend";

export type AzurePageId = "overview" | "resource-groups" | "virtual-machines";

export type AzureVMAction = "start" | "powerOff" | "deallocate" | "restart";

export type AzureViewProps = {
  workspace: WorkspaceSnapshot;
  /** Raw sub-page id from the nav; unknown values fall back to "overview". */
  activePageId: string;
  showSensitiveValues: boolean;
  actionStatus?: string;
  onSelectResourceGroup: (resourceGroup: string) => void;
  onSelectVirtualMachine: (vmId: string) => void;
  onCreateResourceGroup: (name: string, location: string) => void;
  onDeleteResourceGroup: (name: string) => void;
  onInvokeVMAction: (action: AzureVMAction, vmId: string) => void;
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
  activePageId,
  showSensitiveValues,
  actionStatus,
  onSelectResourceGroup,
  onSelectVirtualMachine,
  onCreateResourceGroup,
  onDeleteResourceGroup,
  onInvokeVMAction,
}: AzureViewProps) {
  const page = normalisePageId(activePageId);
  const canWrite = workspace.azureWritesEnabled;
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [pendingVmAction, setPendingVmAction] = useState<
    { action: AzureVMAction; vm: WorkspaceSnapshot["azureVirtualMachines"][number] } | undefined
  >();
  const [newRgName, setNewRgName] = useState("");
  const [newRgLocation, setNewRgLocation] = useState("westeurope");

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
  const canStartVm = canWrite && (selectedVmPower === "stopped" || selectedVmPower === "deallocated");
  const canPowerOffVm = canWrite && selectedVmPower === "running";
  const canDeallocateVm = canWrite && (selectedVmPower === "running" || selectedVmPower === "stopped");
  const canRestartVm = canWrite && selectedVmPower === "running";

  const metricCards = [
    {
      label: "Workspace mode",
      value: workspace.azureWritesEnabled ? "Writes on" : "Read-only",
      detail: workspace.azureWriteCapable
        ? workspace.azureWritesEnabled
          ? `Mutating actions target ${workspace.azureEndpointUrl || "Azure CLI"}`
          : "Enable write mode from the top bar for create/delete actions"
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
        <p className="text-sm text-muted-foreground">
          {workspace.azureStatusMessage ||
            "Azure inventory is waiting for an open Azure workspace."}
        </p>
        {actionStatus ? (
          <p className="text-sm text-muted-foreground">{actionStatus}</p>
        ) : null}
        <div className="overflow-hidden rounded-lg border border-border">
          {workspace.azureResourceGroups.length === 0 ? (
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
        {actionStatus ? <p className="text-sm text-muted-foreground">{actionStatus}</p> : null}
        <div className="overflow-hidden rounded-lg border border-border">
          {workspace.azureVirtualMachines.length === 0 ? (
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
          {selectedVm ? (
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
