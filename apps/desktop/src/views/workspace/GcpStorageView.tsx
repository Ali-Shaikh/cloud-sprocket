// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useMemo, useState } from "react";
import { HardDrive, RefreshCw } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { InlineBanner } from "@/components/inline-banner";
import { ResourceTable } from "@/components/inventory/resource-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GcpStorageBucket, WorkspaceSnapshot } from "@/types/backend";

export type GcpStorageViewProps = {
  workspace: WorkspaceSnapshot;
  onRefresh: () => void;
};

/**
 * Foundation Cloud Storage panel: lists GCS buckets from the workspace snapshot.
 * Object browsing is intentionally deferred to a later release.
 */
export default function GcpStorageView({ workspace, onRefresh }: GcpStorageViewProps) {
  const [filterText, setFilterText] = useState("");
  const buckets = workspace.gcpStorageBuckets ?? [];
  const status = workspace.gcpStorageStatusMessage?.trim() ?? "";

  const filtered = useMemo(() => {
    const query = filterText.trim().toLowerCase();
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
  }, [buckets, filterText]);

  const projectLabel =
    workspace.profile?.attributes.find((field) => field.label.toLowerCase() === "project")
      ?.value ?? workspace.profile?.displayName;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Cloud Storage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bucket inventory for the open gcloud configuration
            {projectLabel ? ` · project ${projectLabel}` : ""}.
          </p>
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
              : "Object browsing is not available in this foundation release."
          }
        />
      ) : null}

      <section className="space-y-3 rounded-lg border border-border bg-card p-[18px] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Buckets</h2>
            <p className="text-xs text-muted-foreground">
              {buckets.length === 1 ? "1 bucket" : `${buckets.length} buckets`} loaded via gcloud.
            </p>
          </div>
          <Input
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
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
          rows={filtered}
          getRowKey={(row) => row.name}
          selectedKey={workspace.selectedGcpStorageBucket}
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
    </div>
  );
}
