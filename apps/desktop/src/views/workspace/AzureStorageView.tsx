// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  FileIcon,
  FolderPlus,
  Trash2,
  Upload,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { actionCapabilityState } from "@/lib/action-capabilities";
import { presentAzureStorageStatus } from "@/lib/azure-storage-status";
import { notify } from "@/lib/notify";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { InventoryLoadingState } from "@/components/inventory-loading-state";
import { azureInventoryLoadingLabel } from "@/lib/azure-inventory";
import { EmptyState } from "@/components/empty-state";
import { InlineBanner } from "@/components/inline-banner";
import { StatusPill } from "@/components/status-pill";
import {
  ResourceInspectorHeader,
  ResourceInspectorPanel,
  ResourceInventoryShell,
} from "@/components/inventory/resource-inspector";
import { ResourceTable } from "@/components/inventory/resource-table";
import { DetailFieldList } from "./detail-fields";
import type { WorkspaceSnapshot } from "@/types/backend";

export type AzureStorageViewProps = {
  workspace: WorkspaceSnapshot;
  actionStatus: string;
  inventoryLoading?: boolean;
  onSelectAccount: (accountName: string) => void;
  onSelectContainer: (containerName: string) => void;
  onSelectBlob: (blobName: string) => void;
  onSetPrefixFilter: (prefix: string) => void;
  onCreateAccount: (resourceGroup: string, accountName: string, location: string) => void;
  onCreateContainer: (containerName: string) => void;
  onUploadBlob: (sourcePath: string, blobName: string) => void;
  onDeleteBlob: (blobName: string) => void;
  onCopyBlob?: (sourceBlobName: string, destinationBlobName: string) => void;
  onCreateFolderPrefix?: (folderPrefix: string) => void;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

function blobFileName(name: string): string {
  const segments = name.split("/").filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : name;
}

function prefixSegments(prefix: string): string[] {
  return prefix.split("/").filter(Boolean);
}

function defaultUploadName(sourcePath: string, prefix?: string): string {
  const fileName = sourcePath.split(/[\\/]/).filter(Boolean).pop() ?? "";
  const cleanPrefix = (prefix ?? "").replace(/^\/+/, "");
  if (!cleanPrefix) {
    return fileName;
  }
  return `${cleanPrefix.replace(/\/?$/, "/")}${fileName}`;
}

/**
 * Single Azure blob browser: account + container + path on one surface.
 * Selection never sends the user to another rail page.
 */
export default function AzureStorageView({
  workspace,
  actionStatus,
  inventoryLoading = false,
  onSelectAccount,
  onSelectContainer,
  onSelectBlob,
  onSetPrefixFilter,
  onCreateAccount,
  onCreateContainer,
  onUploadBlob,
  onDeleteBlob,
  onCopyBlob,
  onCreateFolderPrefix,
}: AzureStorageViewProps) {
  const writeCapability = actionCapabilityState(workspace, "storage", "uploadBlob", "azure");
  const copyCapability = actionCapabilityState(workspace, "storage", "copyBlob", "azure");
  const folderCapability = actionCapabilityState(workspace, "storage", "createFolderPrefix", "azure");
  const canWrite = writeCapability.enabled;
  const writeDisabledReason = writeCapability.reason;
  const inventoryLoadingLabel = azureInventoryLoadingLabel(workspace, "storage");

  const [prefixInput, setPrefixInput] = useState(workspace.azureBlobPrefixFilter ?? "");
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountLocation, setNewAccountLocation] = useState("westeurope");
  const [newAccountResourceGroup, setNewAccountResourceGroup] = useState(
    workspace.selectedAzureResourceGroup ?? "",
  );
  const [createContainerOpen, setCreateContainerOpen] = useState(false);
  const [newContainerName, setNewContainerName] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadSourcePath, setUploadSourcePath] = useState("");
  const [uploadBlobName, setUploadBlobName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [copyDestinationName, setCopyDestinationName] = useState("");
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [folderPrefixDraft, setFolderPrefixDraft] = useState("");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(Boolean(workspace.selectedAzureBlobName));
  const [errorDetailOpen, setErrorDetailOpen] = useState(false);
  const lastSelectedBlobRef = useRef(workspace.selectedAzureBlobName || "");
  const lastPrefixRef = useRef(workspace.azureBlobPrefixFilter || "");

  const statusPresentation = useMemo(
    () => presentAzureStorageStatus(workspace.azureStorageStatusMessage),
    [workspace.azureStorageStatusMessage],
  );

  useEffect(() => {
    const nextBlob = workspace.selectedAzureBlobName || "";
    if (nextBlob !== lastSelectedBlobRef.current) {
      lastSelectedBlobRef.current = nextBlob;
      setInspectorOpen(Boolean(nextBlob));
    }
  }, [workspace.selectedAzureBlobName]);

  useEffect(() => {
    const next = workspace.azureBlobPrefixFilter || "";
    if (next !== lastPrefixRef.current) {
      lastPrefixRef.current = next;
      setPrefixInput(next);
    }
  }, [workspace.azureBlobPrefixFilter]);

  const selectedBlob = workspace.azureBlobs.find(
    (blob) => blob.name === workspace.selectedAzureBlobName,
  );
  const account = workspace.selectedAzureStorageAccount || "";
  const container = workspace.selectedAzureBlobContainer || "";
  const pathParts = prefixSegments(workspace.azureBlobPrefixFilter || "");

  const applyPrefix = (prefix: string) => {
    const normalised = prefix.replace(/^\/+/, "");
    setPrefixInput(normalised);
    lastPrefixRef.current = normalised;
    onSetPrefixFilter(normalised);
  };

  const breadcrumb = (
    <nav
      aria-label="Blob path"
      className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-muted-foreground"
    >
      <button
        type="button"
        className={cn(
          "rounded px-1 font-medium hover:bg-muted hover:text-foreground",
          !account && "text-foreground",
        )}
        onClick={() => {
          if (account) {
            applyPrefix("");
          }
        }}
        disabled={!account}
      >
        {account || "No account"}
      </button>
      {container ? (
        <>
          <ChevronRight className="size-3.5 shrink-0 opacity-50" />
          <button
            type="button"
            className="rounded px-1 font-medium hover:bg-muted hover:text-foreground"
            onClick={() => applyPrefix("")}
          >
            {container}
          </button>
        </>
      ) : null}
      {pathParts.map((segment, index) => {
        const upTo = `${pathParts.slice(0, index + 1).join("/")}/`;
        return (
          <span key={upTo} className="flex items-center gap-1">
            <ChevronRight className="size-3.5 shrink-0 opacity-50" />
            <button
              type="button"
              className="rounded px-1 font-medium hover:bg-muted hover:text-foreground"
              onClick={() => applyPrefix(upTo)}
            >
              {segment}
            </button>
          </span>
        );
      })}
    </nav>
  );

  const inspectorContent = selectedBlob ? (
    <ResourceInspectorPanel>
      <ResourceInspectorHeader
        icon={FileIcon}
        eyebrow="Blob"
        title={blobFileName(selectedBlob.name)}
        subtitle={selectedBlob.name}
        onClose={() => setInspectorOpen(false)}
      />
      <DetailFieldList
        fields={workspace.azureBlobMetadata}
        emptyText="No blob metadata available."
      />
      <div className="flex flex-wrap gap-2">
        {onCopyBlob ? (
          <Button
            variant="outline"
            size="sm"
            disabled={!copyCapability.enabled}
            title={copyCapability.enabled ? undefined : copyCapability.reason}
            onClick={() => {
              setCopyDestinationName(`${selectedBlob.name}-copy`);
              setCopyDialogOpen(true);
            }}
          >
            <Copy />
            Copy blob
          </Button>
        ) : null}
        {canWrite ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteTarget(selectedBlob.name)}
          >
            <Trash2 />
            Delete
          </Button>
        ) : null}
      </div>
    </ResourceInspectorPanel>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Azure Storage</h1>
          <p className="text-sm text-muted-foreground">
            {workspace.profile?.displayName || "Subscription"} · browse account / container / blobs
          </p>
          {breadcrumb}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            status={canWrite ? "on" : "warning"}
            label={canWrite ? "Writes enabled" : "Read-only"}
          />
          {canWrite ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNewAccountResourceGroup(workspace.selectedAzureResourceGroup ?? "");
                  setCreateAccountOpen(true);
                }}
              >
                New account
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!account}
                onClick={() => setCreateContainerOpen(true)}
              >
                New container
              </Button>
              <Button
                size="sm"
                disabled={!container}
                onClick={() => {
                  setUploadSourcePath("");
                  setUploadBlobName("");
                  setUploadOpen(true);
                }}
              >
                <Upload />
                Upload
              </Button>
            </>
          ) : null}
        </div>
      </header>

      {inventoryLoading ? (
        <InventoryLoadingState variant="banner" label={inventoryLoadingLabel} />
      ) : null}

      <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_minmax(0,1.4fr)_auto]">
          <div className="min-w-0">
            <div className={cn(fieldLabel, "mb-1")}>Storage account</div>
            <Select
              value={account || undefined}
              onValueChange={(value) => value && onSelectAccount(value)}
              disabled={workspace.azureStorageAccounts.length === 0}
            >
              <SelectTrigger aria-label="Select storage account" className="w-full">
                <SelectValue
                  placeholder={
                    workspace.azureStorageAccounts.length === 0
                      ? "No accounts loaded"
                      : "Select account"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {workspace.azureStorageAccounts.map((item) => (
                  <SelectItem key={item.name} value={item.name}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <div className={cn(fieldLabel, "mb-1")}>Container</div>
            <Select
              value={container || undefined}
              onValueChange={(value) => value && onSelectContainer(value)}
              disabled={workspace.azureBlobContainers.length === 0}
            >
              <SelectTrigger aria-label="Select blob container" className="w-full">
                <SelectValue
                  placeholder={
                    !account
                      ? "Select account first"
                      : workspace.azureBlobContainers.length === 0
                        ? "No containers"
                        : "Select container"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {workspace.azureBlobContainers.map((item) => (
                  <SelectItem key={item.name} value={item.name}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <div className={cn(fieldLabel, "mb-1")}>Prefix</div>
            <div className="flex gap-2">
              <Input
                value={prefixInput}
                onChange={(event) => setPrefixInput(event.target.value)}
                placeholder="optional/folder/"
                disabled={!container}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    applyPrefix(prefixInput);
                  }
                }}
              />
              <Button
                variant="outline"
                disabled={!container}
                onClick={() => applyPrefix(prefixInput)}
              >
                Go
              </Button>
            </div>
          </div>
          <div className="flex items-end">
            {onCreateFolderPrefix ? (
              <Button
                variant="outline"
                disabled={!folderCapability.enabled || !container}
                title={folderCapability.enabled ? undefined : folderCapability.reason}
                onClick={() => {
                  setFolderPrefixDraft(workspace.azureBlobPrefixFilter || "");
                  setFolderDialogOpen(true);
                }}
              >
                <FolderPlus />
                Folder
              </Button>
            ) : null}
          </div>
        </div>
        {statusPresentation && !statusPresentation.isError ? (
          <p className="text-sm text-muted-foreground">{statusPresentation.title}</p>
        ) : !statusPresentation && !inventoryLoading ? (
          <p className="text-sm text-muted-foreground">Pick an account and container to browse.</p>
        ) : null}
        {actionStatus ? <p className="text-sm text-muted-foreground">{actionStatus}</p> : null}
      </section>

      {statusPresentation?.isError ? (
        <div className="space-y-2">
          <InlineBanner
            tone={statusPresentation.tone}
            title={statusPresentation.title}
            description={statusPresentation.description}
            className="items-start"
          />
          {statusPresentation.detail ? (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <button
                type="button"
                className="flex w-full items-center gap-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setErrorDetailOpen((open) => !open)}
                aria-expanded={errorDetailOpen}
              >
                <ChevronDown
                  className={cn(
                    "size-3.5 shrink-0 transition-transform",
                    errorDetailOpen ? "rotate-0" : "-rotate-90",
                  )}
                />
                Technical detail
              </button>
              {errorDetailOpen ? (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
                  {statusPresentation.detail}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {!account || workspace.azureStorageAccounts.length === 0 ? (
        statusPresentation?.isError ? null : (
          <EmptyState
            icon={<Database />}
            title={
              workspace.azureStorageAccounts.length === 0
                ? "No storage accounts"
                : "Select a storage account"
            }
            description={
              statusPresentation?.title ||
              (workspace.azureStorageAccounts.length === 0
                ? "No accounts were returned for this subscription. Check Azure CLI sign-in or create an account."
                : "Choose an account above. Containers and blobs stay on this page.")
            }
          />
        )
      ) : !container ? (
        statusPresentation?.isError ? null : (
          <EmptyState
            icon={<Database />}
            title={
              workspace.azureBlobContainers.length === 0 ? "No containers" : "Select a container"
            }
            description={
              statusPresentation?.title ||
              "Choose a container above to list blobs. An empty list does not mean containers are private."
            }
          />
        )
      ) : (
        <ResourceInventoryShell
          table={
            <ResourceTable
              columns={[
                { id: "name", label: "Name" },
                { id: "size", label: "Size" },
                { id: "modified", label: "Modified" },
              ]}
              rows={workspace.azureBlobs}
              selectedKey={workspace.selectedAzureBlobName}
              getRowKey={(blob) => blob.name}
              onRowClick={(blob) => {
                onSelectBlob(blob.name);
                setInspectorOpen(true);
              }}
              renderCell={(blob, columnId) => {
                if (columnId === "name") {
                  return <span className="font-medium">{blob.name}</span>;
                }
                if (columnId === "size") {
                  return blob.size || "Unknown";
                }
                return blob.modifiedAt || "Unknown";
              }}
              renderTrailingCell={
                canWrite
                  ? (blob) => (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${blob.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteTarget(blob.name);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    )
                  : undefined
              }
              emptyState={
                statusPresentation?.isError ? (
                  <EmptyState
                    icon={<Database />}
                    title="Blobs unavailable"
                    description="See the error banner above for why this list could not be loaded."
                    className="border-0"
                  />
                ) : (
                  <EmptyState
                    icon={<Database />}
                    title="No blobs"
                    description={
                      workspace.azureBlobPrefixFilter
                        ? `No blobs under prefix “${workspace.azureBlobPrefixFilter}”.`
                        : "This container has no blobs, or inventory is still loading."
                    }
                    className="border-0"
                  />
                )
              }
            />
          }
          inspectorContent={inspectorContent}
          inspectorOpen={inspectorOpen}
          onInspectorOpenChange={setInspectorOpen}
          inspectorAriaLabel="Azure blob details"
        />
      )}

      <AlertDialog open={createAccountOpen} onOpenChange={setCreateAccountOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create storage account</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div>
                  <div className={cn(fieldLabel, "mb-1")}>Resource group</div>
                  <Select
                    value={newAccountResourceGroup}
                    onValueChange={setNewAccountResourceGroup}
                  >
                    <SelectTrigger aria-label="Resource group for new storage account">
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
                  <div className={cn(fieldLabel, "mb-1")}>Account name</div>
                  <Input
                    value={newAccountName}
                    onChange={(event) => setNewAccountName(event.target.value.toLowerCase())}
                    placeholder="mystorageacct"
                  />
                </div>
                <div>
                  <div className={cn(fieldLabel, "mb-1")}>Location</div>
                  <Input
                    value={newAccountLocation}
                    onChange={(event) => setNewAccountLocation(event.target.value)}
                    placeholder="westeurope"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!newAccountResourceGroup.trim() || !newAccountName.trim()}
              onClick={() => {
                onCreateAccount(
                  newAccountResourceGroup.trim(),
                  newAccountName.trim(),
                  newAccountLocation.trim() || "westeurope",
                );
                setNewAccountName("");
                setCreateAccountOpen(false);
              }}
            >
              Create
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={createContainerOpen} onOpenChange={setCreateContainerOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create container</AlertDialogTitle>
            <AlertDialogDescription>
              Creates a blob container in {account || "the selected account"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={newContainerName}
            onChange={(event) => setNewContainerName(event.target.value)}
            placeholder="my-container"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!newContainerName.trim()}
              onClick={() => {
                onCreateContainer(newContainerName.trim());
                setNewContainerName("");
                setCreateContainerOpen(false);
              }}
            >
              Create
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Upload blob</AlertDialogTitle>
            <AlertDialogDescription>
              Upload into {account || "account"}/{container || "container"}
              {workspace.azureBlobPrefixFilter
                ? ` (prefix ${workspace.azureBlobPrefixFilter})`
                : ""}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div>
              <div className={cn(fieldLabel, "mb-1")}>Source file</div>
              <div className="flex gap-2">
                <Input
                  value={uploadSourcePath}
                  onChange={(event) => setUploadSourcePath(event.target.value)}
                  placeholder="C:\\path\\to\\file.txt"
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    void open({ multiple: false }).then((path) => {
                      if (typeof path === "string") {
                        setUploadSourcePath(path);
                        setUploadBlobName(
                          defaultUploadName(path, workspace.azureBlobPrefixFilter),
                        );
                      }
                    });
                  }}
                >
                  Browse
                </Button>
              </div>
            </div>
            <div>
              <div className={cn(fieldLabel, "mb-1")}>Blob name</div>
              <Input
                value={uploadBlobName}
                onChange={(event) => setUploadBlobName(event.target.value)}
                placeholder="folder/file.txt"
              />
            </div>
            {writeDisabledReason ? (
              <p className="text-sm text-muted-foreground">{writeDisabledReason}</p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !canWrite ||
                !uploadSourcePath.trim() ||
                !uploadBlobName.trim() ||
                !container
              }
              onClick={() => {
                onUploadBlob(uploadSourcePath.trim(), uploadBlobName.trim());
                notify("success", "Blob upload started");
                setUploadOpen(false);
              }}
            >
              Upload
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete blob?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <strong>{deleteTarget}</strong> from {account}/{container}. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  onDeleteBlob(deleteTarget);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copy blob</AlertDialogTitle>
            <AlertDialogDescription>
              Copy {workspace.selectedAzureBlobName} to a new name in the same container.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={copyDestinationName}
            placeholder="archive/readme-copy.txt"
            onChange={(event) => setCopyDestinationName(event.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!copyDestinationName.trim() || !workspace.selectedAzureBlobName}
              onClick={() => {
                if (onCopyBlob && workspace.selectedAzureBlobName && copyDestinationName.trim()) {
                  onCopyBlob(workspace.selectedAzureBlobName, copyDestinationName.trim());
                  setCopyDialogOpen(false);
                }
              }}
            >
              Copy blob
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create folder prefix</AlertDialogTitle>
            <AlertDialogDescription>
              Creates a zero-byte folder marker. Use forward slashes, for example reports/2026/.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={folderPrefixDraft}
            placeholder="reports/2026/"
            onChange={(event) => setFolderPrefixDraft(event.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!folderPrefixDraft.trim()}
              onClick={() => {
                if (onCreateFolderPrefix && folderPrefixDraft.trim()) {
                  onCreateFolderPrefix(folderPrefixDraft.trim());
                  setFolderDialogOpen(false);
                }
              }}
            >
              Create folder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
