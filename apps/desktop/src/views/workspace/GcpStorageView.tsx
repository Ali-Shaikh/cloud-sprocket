// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useMemo, useState } from "react";
import {
  ChevronRight,
  File as FileIcon,
  FolderOpen,
  HardDrive,
  RefreshCw,
} from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { InlineBanner } from "@/components/inline-banner";
import { ResourceTable } from "@/components/inventory/resource-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTimestamp } from "@/lib/format";
import {
  filterObjectsByKeyQuery,
  s3EntryDisplayName,
  s3ObjectListSummary,
} from "@/lib/s3-object-filter";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { cn } from "@/lib/utils";
import type { GcpStorageBucket, GcpStorageObject, WorkspaceSnapshot } from "@/types/backend";

export type GcpStorageViewProps = {
  workspace: WorkspaceSnapshot;
  onRefresh: () => void;
  onSelectBucket: (bucketName: string) => void;
  onSetPrefixFilter: (prefix: string) => void;
  onLoadMoreObjects?: () => void;
  loadMoreInFlight?: boolean;
  listingLoading?: boolean;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

function prefixSegments(prefix: string): string[] {
  return prefix.split("/").filter(Boolean);
}

function objectDisplayName(key: string, currentPrefix: string): string {
  return s3EntryDisplayName(key, currentPrefix);
}

/**
 * Cloud Storage browser: bucket list + prefix navigation + objects table.
 * Read-only first slice (select bucket, open folders, load more when available).
 */
export default function GcpStorageView({
  workspace,
  onRefresh,
  onSelectBucket,
  onSetPrefixFilter,
  onLoadMoreObjects,
  loadMoreInFlight = false,
  listingLoading = false,
}: GcpStorageViewProps) {
  const [bucketFilter, setBucketFilter] = useState("");
  const [keySearch, setKeySearch] = useState("");
  const debouncedKeySearch = useDebouncedValue(keySearch, 200);

  const buckets = workspace.gcpStorageBuckets ?? [];
  const objects = workspace.gcpStorageObjects ?? [];
  const status = workspace.gcpStorageStatusMessage?.trim() ?? "";
  const bucketName = workspace.selectedGcpStorageBucket ?? "";
  const prefix = workspace.gcpStoragePrefixFilter ?? "";
  const hasMore = Boolean(workspace.gcpStorageObjectsHasMore);
  const nextToken = workspace.gcpStorageObjectsNextToken ?? "";

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
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
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
            ]}
            rows={visibleObjects}
            getRowKey={(object) => object.key}
            onRowClick={(object) => {
              if (object.isFolder) {
                applyPrefix(object.key);
              }
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
        </section>
      ) : null}
    </div>
  );
}
