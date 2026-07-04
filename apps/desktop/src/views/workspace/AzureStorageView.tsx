// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Database, Trash2, Upload } from "lucide-react";

import { cn } from "@/lib/utils";
import { actionCapabilityState } from "@/lib/action-capabilities";
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
import { InventoryLoadingState } from "@/components/inventory-loading-state";
import { azureInventoryLoadingLabel } from "@/lib/azure-inventory";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import { DetailFieldList } from "./detail-fields";
import type { WorkspaceSnapshot } from "@/types/backend";

export type AzureStoragePageId = "accounts" | "containers" | "blobs" | "upload";

export type AzureStorageViewProps = {
  workspace: WorkspaceSnapshot;
  activePageId: string;
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
};

function normalisePageId(pageId: string): AzureStoragePageId {
  if (pageId === "accounts" || pageId === "containers" || pageId === "upload") {
    return pageId;
  }
  return "blobs";
}

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

export default function AzureStorageView({
  workspace,
  activePageId,
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
}: AzureStorageViewProps) {
  const page = normalisePageId(activePageId);
  const writeCapability = actionCapabilityState(workspace, "storage", "uploadBlob", "azure");
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
  const [newContainerName, setNewContainerName] = useState("");
  const [uploadSourcePath, setUploadSourcePath] = useState("");
  const [uploadBlobName, setUploadBlobName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const selectedBlob = workspace.azureBlobs.find(
    (blob) => blob.name === workspace.selectedAzureBlobName,
  );

  const accountsPage = (
    <section className={sectionCard}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Storage Accounts</h2>
          <p className="text-sm text-muted-foreground">
            Blob storage accounts for the open Azure subscription. floci-az includes{" "}
            <code className="text-xs">devstoreaccount1</code> plus any accounts you create via ARM.
          </p>
        </div>
        {canWrite ? (
          <Button
            onClick={() => {
              setNewAccountResourceGroup(workspace.selectedAzureResourceGroup ?? "");
              setCreateAccountOpen(true);
            }}
          >
            Create account
          </Button>
        ) : null}
      </div>
      {inventoryLoading ? (
        <InventoryLoadingState variant="inline" label={inventoryLoadingLabel} />
      ) : (
        <p className="text-sm text-muted-foreground">{workspace.azureStorageStatusMessage}</p>
      )}
      <div className="overflow-hidden rounded-lg border border-border">
        {inventoryLoading && workspace.azureStorageAccounts.length === 0 ? (
          <InventoryLoadingState
            label={inventoryLoadingLabel}
            className="border-0 bg-transparent"
          />
        ) : workspace.azureStorageAccounts.length === 0 ? (
          <EmptyState
            icon={<Database />}
            title="No storage accounts"
            description="No Azure storage accounts were returned for this subscription."
            className="border-0"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Blob endpoint</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspace.azureStorageAccounts.map((account) => {
                const active = account.name === workspace.selectedAzureStorageAccount;
                return (
                  <TableRow
                    key={account.name}
                    data-state={active ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => onSelectAccount(account.name)}
                  >
                    <TableCell className="font-medium">{account.name}</TableCell>
                    <TableCell>{account.kind || "Unknown"}</TableCell>
                    <TableCell>{account.location || "Unknown"}</TableCell>
                    <TableCell className="max-w-[240px] truncate font-mono text-xs">
                      {account.blobEndpoint || "Unavailable"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );

  const containersPage = (
    <section className={sectionCard}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Blob Containers</h2>
          <p className="text-sm text-muted-foreground">
            Containers in {workspace.selectedAzureStorageAccount || "the selected account"}.
          </p>
        </div>
        <StatusPill
          status={canWrite ? "on" : "warning"}
          label={canWrite ? "Writes enabled" : "Read-only"}
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <div className={cn(fieldLabel, "mb-1")}>Storage account</div>
          <Select
            value={workspace.selectedAzureStorageAccount ?? ""}
            onValueChange={(value) => {
              if (value) {
                onSelectAccount(value);
              }
            }}
          >
            <SelectTrigger aria-label="Select storage account">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {workspace.azureStorageAccounts.map((account) => (
                <SelectItem key={account.name} value={account.name}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <div className={cn(fieldLabel, "mb-1")}>New container</div>
              <Input
                value={newContainerName}
                onChange={(event) => setNewContainerName(event.target.value)}
                placeholder="my-container"
                className="w-48"
              />
            </div>
            <Button
              disabled={!newContainerName.trim()}
              onClick={() => {
                onCreateContainer(newContainerName.trim());
                setNewContainerName("");
              }}
            >
              Create container
            </Button>
          </div>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        {workspace.azureBlobContainers.length === 0 ? (
          <EmptyState
            icon={<Database />}
            title="No containers"
            description="No blob containers were returned for the selected storage account."
            className="border-0"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Last modified</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspace.azureBlobContainers.map((container) => {
                const active = container.name === workspace.selectedAzureBlobContainer;
                return (
                  <TableRow
                    key={container.name}
                    data-state={active ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => onSelectContainer(container.name)}
                  >
                    <TableCell className="font-medium">{container.name}</TableCell>
                    <TableCell>{container.lastModified || "Unknown"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );

  const blobsPage = (
    <>
      <section className={sectionCard}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-52">
            <div className={cn(fieldLabel, "mb-1")}>Container</div>
            <Select
              value={workspace.selectedAzureBlobContainer ?? ""}
              onValueChange={(value) => {
                if (value) {
                  onSelectContainer(value);
                }
              }}
            >
              <SelectTrigger aria-label="Select blob container">
                <SelectValue placeholder="Select container" />
              </SelectTrigger>
              <SelectContent>
                {workspace.azureBlobContainers.map((container) => (
                  <SelectItem key={container.name} value={container.name}>
                    {container.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[200px] flex-1">
            <div className={cn(fieldLabel, "mb-1")}>Prefix filter</div>
            <div className="flex gap-2">
              <Input
                value={prefixInput}
                onChange={(event) => setPrefixInput(event.target.value)}
                placeholder="optional/prefix/"
              />
              <Button
                variant="outline"
                onClick={() => onSetPrefixFilter(prefixInput)}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{workspace.azureStorageStatusMessage}</p>
        {actionStatus ? (
          <p className="text-sm text-muted-foreground">{actionStatus}</p>
        ) : null}
        <div className="overflow-hidden rounded-lg border border-border">
          {workspace.azureBlobs.length === 0 ? (
            <EmptyState
              icon={<Database />}
              title="No blobs"
              description="No blobs were returned for the selected container."
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Modified</TableHead>
                  {canWrite ? <TableHead className="w-20" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {workspace.azureBlobs.map((blob) => {
                  const active = blob.name === workspace.selectedAzureBlobName;
                  return (
                    <TableRow
                      key={blob.name}
                      data-state={active ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={() => onSelectBlob(blob.name)}
                    >
                      <TableCell className="font-medium">{blob.name}</TableCell>
                      <TableCell>{blob.size || "Unknown"}</TableCell>
                      <TableCell>{blob.modifiedAt || "Unknown"}</TableCell>
                      {canWrite ? (
                        <TableCell>
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
        <h2 className="text-base font-bold">Blob detail</h2>
        {selectedBlob ? (
          <DetailFieldList
            fields={workspace.azureBlobMetadata}
            emptyText="No blob metadata available."
          />
        ) : (
          <p className="text-sm text-muted-foreground">Select a blob to inspect metadata.</p>
        )}
      </section>
    </>
  );

  const uploadPage = (
    <section className={sectionCard}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Upload blob</h2>
          <p className="text-sm text-muted-foreground">
            Upload a local file to{" "}
            {workspace.selectedAzureStorageAccount || "account"}/
            {workspace.selectedAzureBlobContainer || "container"}.
          </p>
        </div>
        <StatusPill
          status={canWrite ? "on" : "warning"}
          label={canWrite ? "Writes enabled" : "Read-only"}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className={cn(fieldLabel, "mb-1")}>Source file</div>
          <div className="flex gap-2">
            <Input
              value={uploadSourcePath}
              onChange={(event) => setUploadSourcePath(event.target.value)}
              placeholder="C:\path\to\file.txt"
            />
            <Button
              variant="outline"
              onClick={() => {
                void open({ multiple: false }).then((path) => {
                  if (typeof path === "string") {
                    setUploadSourcePath(path);
                    const fileName = path.split(/[\\/]/).filter(Boolean).pop() ?? "";
                    if (!uploadBlobName) {
                      setUploadBlobName(fileName);
                    }
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
      </div>
      <Button
        disabled={
          !canWrite ||
          !uploadSourcePath.trim() ||
          !uploadBlobName.trim() ||
          !workspace.selectedAzureBlobContainer
        }
        onClick={() => {
          onUploadBlob(uploadSourcePath.trim(), uploadBlobName.trim());
          notify("success", "Blob upload started");
        }}
      >
        <Upload />
        Upload blob
      </Button>
      {writeDisabledReason ? (
        <p className="text-sm text-muted-foreground">{writeDisabledReason}</p>
      ) : null}
      {actionStatus ? <p className="text-sm text-muted-foreground">{actionStatus}</p> : null}
    </section>
  );

  const pageTitles: Record<AzureStoragePageId, string> = {
    accounts: "Accounts",
    containers: "Containers",
    blobs: "Blobs",
    upload: "Upload",
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Azure Storage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspace.profile?.displayName || "Subscription"} · {pageTitles[page]}
        </p>
      </header>
      {page === "accounts" ? accountsPage : null}
      {page === "containers" ? containersPage : null}
      {page === "blobs" ? blobsPage : null}
      {page === "upload" ? uploadPage : null}

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

      <AlertDialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete blob?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <strong>{deleteTarget}</strong> from{" "}
              {workspace.selectedAzureStorageAccount}/{workspace.selectedAzureBlobContainer}. This
              action cannot be undone.
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
    </div>
  );
}