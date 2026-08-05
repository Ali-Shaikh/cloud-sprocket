// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useMemo, useState } from "react";
import {
  ChevronRight,
  Copy,
  File as FileIcon,
  FolderOpen,
  HardDrive,
  Link2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

import { EmptyState } from "@/components/empty-state";
import { InlineBanner } from "@/components/inline-banner";
import { ResourceTable } from "@/components/inventory/resource-table";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { actionCapabilityState, actionDisabledReason } from "@/lib/action-capabilities";
import { formatTimestamp } from "@/lib/format";
import { notify } from "@/lib/notify";
import {
  filterObjectsByKeyQuery,
  s3EntryDisplayName,
  s3ObjectListSummary,
} from "@/lib/s3-object-filter";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { cn } from "@/lib/utils";
import type {
  GcpStorageBucket,
  GcpStorageObject,
  GcpStorageSignUrlResult,
  WorkspaceSnapshot,
} from "@/types/backend";

export type GcpStorageViewProps = {
  workspace: WorkspaceSnapshot;
  onRefresh: () => void;
  onSelectBucket: (bucketName: string) => void;
  onSetPrefixFilter: (prefix: string) => void;
  onLoadMoreObjects?: () => void;
  onUploadObject?: (sourcePath: string, objectKey: string) => void;
  onDeleteObject?: (objectKey: string) => void;
  onSignUrl?: (objectKey: string, durationSeconds: number) => void;
  signedUrlResult?: GcpStorageSignUrlResult;
  signedUrlStatus?: string;
  loadMoreInFlight?: boolean;
  listingLoading?: boolean;
};

function copyToClipboard(value: string, label = "Copied to clipboard"): void {
  if (navigator.clipboard) {
    void navigator.clipboard.writeText(value);
    notify("success", label);
  }
}

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

function prefixSegments(prefix: string): string[] {
  return prefix.split("/").filter(Boolean);
}

function objectDisplayName(key: string, currentPrefix: string): string {
  return s3EntryDisplayName(key, currentPrefix);
}

function defaultUploadKey(sourcePath: string, prefix?: string): string {
  const fileName = sourcePath.split(/[\\/]/).filter(Boolean).pop() ?? "";
  const cleanPrefix = (prefix ?? "").replace(/^\/+/, "");
  if (!cleanPrefix) {
    return fileName;
  }
  return `${cleanPrefix.replace(/\/?$/, "/")}${fileName}`;
}

/**
 * Cloud Storage browser: bucket list + prefix navigation + objects table.
 * Upload/delete are gated by GCP write mode (top bar). Signed read URLs do not
 * require write mode.
 */
export default function GcpStorageView({
  workspace,
  onRefresh,
  onSelectBucket,
  onSetPrefixFilter,
  onLoadMoreObjects,
  onUploadObject,
  onDeleteObject,
  onSignUrl,
  signedUrlResult,
  signedUrlStatus,
  loadMoreInFlight = false,
  listingLoading = false,
}: GcpStorageViewProps) {
  const [bucketFilter, setBucketFilter] = useState("");
  const [keySearch, setKeySearch] = useState("");
  const debouncedKeySearch = useDebouncedValue(keySearch, 200);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadSourcePath, setUploadSourcePath] = useState("");
  const [uploadObjectKey, setUploadObjectKey] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [selectedObjectKey, setSelectedObjectKey] = useState("");

  const buckets = workspace.gcpStorageBuckets ?? [];
  const objects = workspace.gcpStorageObjects ?? [];
  const status = workspace.gcpStorageStatusMessage?.trim() ?? "";
  const bucketName = workspace.selectedGcpStorageBucket ?? "";
  const prefix = workspace.gcpStoragePrefixFilter ?? "";
  const hasMore = Boolean(workspace.gcpStorageObjectsHasMore);
  const nextToken = workspace.gcpStorageObjectsNextToken ?? "";
  const selectedObject = objects.find(
    (entry) => !entry.isFolder && entry.key === selectedObjectKey,
  );

  const uploadCapability = actionCapabilityState(workspace, "storage", "uploadObject", "gcp");
  const deleteCapability = actionCapabilityState(workspace, "storage", "deleteObject", "gcp");
  const canUpload =
    uploadCapability.enabled &&
    Boolean(bucketName) &&
    Boolean(uploadSourcePath.trim()) &&
    Boolean(uploadObjectKey.trim());
  const uploadDisabledReason = canUpload
    ? undefined
    : actionDisabledReason(
        workspace,
        "storage",
        "uploadObject",
        !bucketName
          ? "Select a bucket first."
          : !uploadSourcePath.trim()
            ? "Choose a local file to upload."
            : !uploadObjectKey.trim()
              ? "Enter a destination object key."
              : undefined,
        "gcp",
      );
  const writeDisabledReason = actionDisabledReason(
    workspace,
    "storage",
    "uploadObject",
    undefined,
    "gcp",
  );

  const filteredBuckets = useMemo(() => {
    const query = bucketFilter.trim().toLowerCase();
    if (!query) {
      return buckets;
    }
    return buckets.filter((bucket) => {
      const haystack = [bucket.name, bucket.location, bucket.storageClass, bucket.summary]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [buckets, bucketFilter]);

  const visibleObjects = useMemo(
    () => filterObjectsByKeyQuery(objects, debouncedKeySearch),
    [objects, debouncedKeySearch],
  );
  const searchActive = debouncedKeySearch.trim().length > 0;
  const listSummary = s3ObjectListSummary(objects.length, visibleObjects.length, searchActive);

  const projectLabel =
    workspace.profile?.attributes.find((field) => field.label.toLowerCase() === "project")
      ?.value ?? workspace.profile?.displayName;

  const pathParts = prefixSegments(prefix);

  const applyPrefix = (nextPrefix: string) => {
    setKeySearch("");
    setSelectedObjectKey("");
    onSetPrefixFilter(nextPrefix.replace(/^\/+/, ""));
  };

  const breadcrumb = (
    <nav
      aria-label="Cloud Storage path"
      className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-muted-foreground"
    >
      <button
        type="button"
        className="rounded px-1 font-medium hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        onClick={() => applyPrefix("")}
        disabled={!bucketName || listingLoading}
      >
        {bucketName || "No bucket"}
      </button>
      {pathParts.map((segment, index) => {
        const upTo = `${pathParts.slice(0, index + 1).join("/")}/`;
        return (
          <span key={upTo} className="flex items-center gap-1">
            <ChevronRight className="size-3.5 shrink-0 opacity-50" />
            <button
              type="button"
              className="rounded px-1 font-medium hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              onClick={() => applyPrefix(upTo)}
              disabled={listingLoading}
            >
              {segment}
            </button>
          </span>
        );
      })}
    </nav>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Cloud Storage</h1>
          <p className="text-sm text-muted-foreground">
            Bucket inventory and object browser for the open gcloud configuration
            {projectLabel ? ` · project ${projectLabel}` : ""}.
          </p>
          {bucketName ? breadcrumb : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onUploadObject ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!bucketName || listingLoading}
              title={writeDisabledReason}
              onClick={() => {
                setUploadSourcePath("");
                setUploadObjectKey("");
                setUploadOpen(true);
              }}
            >
              <Upload className="size-3.5" />
              Upload
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        </div>
      </header>

      {status ? (
        <InlineBanner
          tone={status.startsWith("Could not") ? "warning" : "info"}
          title={status.split("\n")[0] ?? status}
          description={
            status.includes("\n")
              ? status.split("\n").slice(1).join(" ").trim()
              : bucketName
                ? "Click a folder row to open it, or use the breadcrumb to go up."
                : "Select a bucket to list objects under the current prefix."
          }
        />
      ) : null}

      <section className="space-y-3 rounded-lg border border-border bg-card p-[18px] shadow-sm">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="min-w-0">
            <div className={cn(fieldLabel, "mb-1")}>Bucket</div>
            <Select
              value={bucketName || undefined}
              onValueChange={(value) => {
                if (!value) {
                  return;
                }
                setKeySearch("");
                setSelectedObjectKey("");
                onSelectBucket(value);
              }}
              disabled={buckets.length === 0 || listingLoading}
            >
              <SelectTrigger className="w-full" aria-label="Select Cloud Storage bucket">
                <SelectValue
                  placeholder={buckets.length === 0 ? "No buckets loaded" : "Select bucket"}
                />
              </SelectTrigger>
              <SelectContent>
                {buckets.map((bucket) => (
                  <SelectItem key={bucket.name} value={bucket.name} title={bucket.name}>
                    {bucket.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <div className={cn(fieldLabel, "mb-1")}>Search in this folder (contains)</div>
            <Input
              value={keySearch}
              onChange={(event) => setKeySearch(event.target.value)}
              placeholder="Filter loaded folders and files by name"
              disabled={!bucketName || listingLoading || objects.length === 0}
              aria-label="Filter Cloud Storage objects"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {buckets.length === 1 ? "1 bucket" : `${buckets.length} buckets`} loaded via gcloud
            {bucketName ? ` · ${listSummary}` : ""}.
          </p>
          <Input
            value={bucketFilter}
            onChange={(event) => setBucketFilter(event.target.value)}
            placeholder="Filter buckets"
            className="max-w-xs"
            aria-label="Filter Cloud Storage buckets"
          />
        </div>

        <ResourceTable<GcpStorageBucket>
          columns={[
            { id: "name", label: "Name" },
            { id: "location", label: "Location" },
            { id: "storageClass", label: "Storage class" },
            { id: "createdAt", label: "Created" },
          ]}
          rows={filteredBuckets}
          getRowKey={(row) => row.name}
          selectedKey={bucketName}
          onRowClick={(row) => {
            setKeySearch("");
            onSelectBucket(row.name);
          }}
          renderCell={(row, columnId) => {
            switch (columnId) {
              case "name":
                return row.name;
              case "location":
                return row.location || row.locationType || "-";
              case "storageClass":
                return row.storageClass || "-";
              case "createdAt":
                return row.createdAt || "-";
              default:
                return null;
            }
          }}
          emptyState={
            <EmptyState
              icon={<HardDrive />}
              title={
                buckets.length === 0
                  ? "No buckets in this project"
                  : "No buckets match the filter"
              }
              description={
                buckets.length === 0
                  ? "Create a bucket in the Google Cloud console or with gcloud, then refresh."
                  : "Clear the filter to see the full inventory."
              }
            />
          }
        />
      </section>

      {bucketName ? (
        <section className="space-y-3 rounded-lg border border-border bg-card p-[18px] shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">Objects</h2>
              <p className="text-xs text-muted-foreground">
                {listSummary}
                {prefix ? ` under ${prefix}` : " at bucket root"}.
              </p>
            </div>
            {hasMore && onLoadMoreObjects ? (
              <Button
                variant="outline"
                size="sm"
                disabled={loadMoreInFlight || !nextToken || listingLoading}
                onClick={() => onLoadMoreObjects()}
              >
                {loadMoreInFlight ? "Loading…" : "Load more"}
              </Button>
            ) : null}
          </div>

          <ResourceTable<GcpStorageObject>
            columns={[
              {
                id: "key",
                label: "Name",
                cellClassName: "max-w-0 truncate font-medium",
              },
              { id: "size", label: "Size", headerClassName: "w-28", cellClassName: "truncate" },
              {
                id: "updated",
                label: "Updated",
                headerClassName: "w-44",
                cellClassName: "truncate",
              },
              {
                id: "contentType",
                label: "Type",
                headerClassName: "w-40",
                cellClassName: "truncate",
              },
              {
                id: "actions",
                label: "",
                headerClassName: "w-20",
                cellClassName: "text-right",
              },
            ]}
            rows={visibleObjects}
            getRowKey={(object) => object.key}
            selectedKey={selectedObjectKey || undefined}
            onRowClick={(object) => {
              if (object.isFolder) {
                applyPrefix(object.key);
                return;
              }
              setSelectedObjectKey(object.key);
            }}
            getCellTitle={(object, columnId) =>
              columnId === "key" ? object.key : columnId === "updated" ? object.updated : undefined
            }
            renderCell={(object, columnId) => {
              if (columnId === "key") {
                const label = objectDisplayName(object.key, prefix);
                if (object.isFolder) {
                  return (
                    <span className="inline-flex items-center gap-2">
                      <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                      <span>{label}/</span>
                    </span>
                  );
                }
                return (
                  <span className="inline-flex items-center gap-2">
                    <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span>{label}</span>
                  </span>
                );
              }
              if (columnId === "size") {
                return object.isFolder ? "-" : object.size || "Unknown";
              }
              if (columnId === "updated") {
                return object.isFolder
                  ? "-"
                  : object.updated
                    ? formatTimestamp(object.updated)
                    : "Unknown";
              }
              if (columnId === "contentType") {
                return object.isFolder ? "Folder" : object.contentType || "-";
              }
              if (columnId === "actions") {
                if (object.isFolder || !onDeleteObject) {
                  return null;
                }
                return (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    disabled={!deleteCapability.enabled}
                    title={
                      deleteCapability.enabled
                        ? `Delete ${object.key}`
                        : deleteCapability.reason
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeleteTarget(object.key);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                    <span className="sr-only">Delete</span>
                  </Button>
                );
              }
              return null;
            }}
            emptyState={
              <EmptyState
                icon={<FolderOpen />}
                title={
                  objects.length === 0
                    ? "This folder is empty"
                    : "No objects match the filter"
                }
                description={
                  objects.length === 0
                    ? "Open another folder from the breadcrumb, or select a different bucket."
                    : "Clear the name filter to see the full page."
                }
              />
            }
          />

          {selectedObject && onSignUrl ? (
            <div className="space-y-3 rounded-lg border border-border bg-background/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className={cn(fieldLabel, "mb-0.5")}>Selected object</div>
                  <p className="truncate font-mono text-sm" title={selectedObject.key}>
                    {selectedObject.key}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSignUrl(selectedObject.key, 3600)}
                >
                  <Link2 className="size-3.5" />
                  Signed link (1h)
                </Button>
              </div>
              {signedUrlStatus ? (
                <p className="text-xs text-muted-foreground">{signedUrlStatus}</p>
              ) : null}
              {signedUrlResult && signedUrlResult.objectKey === selectedObject.key ? (
                <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <span className={fieldLabel}>
                    Signed link · expires {formatTimestamp(signedUrlResult.expiresAt)}
                  </span>
                  <code
                    className="block break-all rounded bg-background/60 p-2 font-mono text-xs leading-relaxed"
                    title={signedUrlResult.url}
                  >
                    {signedUrlResult.url}
                  </code>
                  <Button
                    size="sm"
                    onClick={() => copyToClipboard(signedUrlResult.url, "Signed URL copied")}
                  >
                    <Copy className="size-3.5" />
                    Copy link
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <AlertDialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Upload object</AlertDialogTitle>
            <AlertDialogDescription>
              Upload into {bucketName || "bucket"}
              {prefix ? ` (prefix ${prefix})` : ""}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div>
              <div className={cn(fieldLabel, "mb-1")}>Source file</div>
              <div className="flex gap-2">
                <Input
                  value={uploadSourcePath}
                  onChange={(event) => {
                    setUploadSourcePath(event.target.value);
                    if (!uploadObjectKey) {
                      setUploadObjectKey(defaultUploadKey(event.target.value, prefix));
                    }
                  }}
                  placeholder="Local file path"
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    void open({ multiple: false }).then((path) => {
                      if (typeof path === "string") {
                        setUploadSourcePath(path);
                        setUploadObjectKey(defaultUploadKey(path, prefix));
                      }
                    });
                  }}
                >
                  Browse
                </Button>
              </div>
            </div>
            <div>
              <div className={cn(fieldLabel, "mb-1")}>Object key</div>
              <Input
                value={uploadObjectKey}
                onChange={(event) => setUploadObjectKey(event.target.value)}
                placeholder="folder/file.txt"
              />
            </div>
            {uploadDisabledReason ? (
              <p className="text-sm text-muted-foreground">{uploadDisabledReason}</p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canUpload || !onUploadObject}
              onClick={() => {
                if (!onUploadObject) {
                  return;
                }
                onUploadObject(uploadSourcePath.trim(), uploadObjectKey.trim());
                notify("success", "Object upload started");
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
            <AlertDialogTitle>Delete object?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <strong>{deleteTarget}</strong> from gs://{bucketName}/. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget && onDeleteObject) {
                  onDeleteObject(deleteTarget);
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
