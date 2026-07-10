// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ChevronRight,
  Copy,
  Database,
  File as FileIcon,
  FileArchive,
  FileCode,
  FileImage,
  FileText,
  FolderOpen,
  FolderPlus,
  Link2,
  Search,
  Upload,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import {
  filterObjectsByKeyQuery,
  s3EntryDisplayName,
  s3ObjectListSummary,
} from "@/lib/s3-object-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import {
  ResourceInspectorHeader,
  ResourceInspectorPanel,
  ResourceInventoryShell,
} from "@/components/inventory/resource-inspector";
import { ResourceTable } from "@/components/inventory/resource-table";
import { StatusPill } from "@/components/status-pill";
import { InventoryLoadingState } from "@/components/inventory-loading-state";
import { actionCapabilityState, actionDisabledReason } from "@/lib/action-capabilities";
import { DetailFieldList } from "./detail-fields";
import type {
  AwsS3PresignResult,
  UrlInspection,
  UrlValidationResult,
  WorkspaceSnapshot,
} from "@/types/backend";

export type StorageViewProps = {
  workspace: WorkspaceSnapshot;
  showSensitiveValues: boolean;
  onSelectBucket: (bucketName: string) => void;
  onSelectObject: (objectKey: string) => void;
  onSetPrefixFilter: (prefix: string) => void;
  onLoadMoreObjects?: () => void;
  loadMoreInFlight?: boolean;
  listingLoading?: boolean;
  listingLoadingLabel?: string;
  uploadStatus: string;
  signedUrlStatus: string;
  signedUrlResult?: AwsS3PresignResult;
  urlInspection?: UrlInspection;
  urlValidation?: UrlValidationResult;
  onUploadObject: (sourcePath: string, objectKey: string) => void;
  onPresignObject: (durationSeconds: number) => void;
  onAnalyseUrl: (url: string) => void;
  onValidateUrl: (url: string) => void;
  onDeleteObject?: (objectKey: string) => void;
  onCreateBucket?: (bucketName: string, region?: string) => void;
  onCopyObject?: (sourceObjectKey: string, destinationObjectKey: string) => void;
  onCreateFolderPrefix?: (folderPrefix: string) => void;
};

function defaultUploadKey(sourcePath: string, prefix?: string): string {
  const fileName = sourcePath.split(/[\\/]/).filter(Boolean).pop() ?? "";
  const cleanPrefix = (prefix ?? "").replace(/^\/+/, "");
  if (!cleanPrefix) {
    return fileName;
  }
  return `${cleanPrefix.replace(/\/?$/, "/")}${fileName}`;
}

function copyToClipboard(value: string, label = "Copied to clipboard"): void {
  if (navigator.clipboard) {
    void navigator.clipboard.writeText(value);
    notify("success", label);
  }
}

function objectFileName(key: string): string {
  const segments = key.split("/").filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : key;
}

function objectFileIcon(key: string) {
  const extension = key.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(extension)) {
    return FileImage;
  }
  if (["zip", "gz", "tar", "tgz", "rar", "7z", "bz2"].includes(extension)) {
    return FileArchive;
  }
  if (["txt", "md", "csv", "log", "pdf"].includes(extension)) {
    return FileText;
  }
  if (["json", "yaml", "yml", "xml", "js", "ts", "tsx", "go", "rs", "sh", "html"].includes(extension)) {
    return FileCode;
  }
  return FileIcon;
}

type DurationUnit = "minutes" | "hours" | "days";

const UNIT_SECONDS: Record<DurationUnit, number> = {
  minutes: 60,
  hours: 3600,
  days: 86400,
};

const MAX_PRESIGN_SECONDS = 7 * 86400;

const SIGNED_URL_PRESETS: { label: string; amount: number; unit: DurationUnit }[] = [
  { label: "15 min", amount: 15, unit: "minutes" },
  { label: "1 hour", amount: 1, unit: "hours" },
  { label: "12 hours", amount: 12, unit: "hours" },
  { label: "7 days", amount: 7, unit: "days" },
];

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

function prefixSegments(prefix: string): string[] {
  return prefix.split("/").filter(Boolean);
}

/**
 * Single S3 browser: bucket + prefix path + objects + inspector on one surface.
 * Upload and URL inspect are dialogs, not separate rail destinations.
 */
export default function StorageView({
  workspace,
  showSensitiveValues,
  onSelectBucket,
  onSelectObject,
  onSetPrefixFilter,
  onLoadMoreObjects,
  loadMoreInFlight = false,
  listingLoading = false,
  listingLoadingLabel = "Loading objects…",
  uploadStatus,
  signedUrlStatus,
  signedUrlResult,
  urlInspection,
  urlValidation,
  onUploadObject,
  onPresignObject,
  onAnalyseUrl,
  onValidateUrl,
  onDeleteObject,
  onCreateBucket,
  onCopyObject,
  onCreateFolderPrefix,
}: StorageViewProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [urlToolsOpen, setUrlToolsOpen] = useState(false);
  const [uploadSourcePath, setUploadSourcePath] = useState("");
  const [uploadObjectKey, setUploadObjectKey] = useState("");
  const [uploadAcknowledged, setUploadAcknowledged] = useState(false);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | undefined>(undefined);
  const [copyDestinationKey, setCopyDestinationKey] = useState("");
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [folderPrefixDraft, setFolderPrefixDraft] = useState("");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newBucketName, setNewBucketName] = useState("");
  const deleteCapability = actionCapabilityState(workspace, "s3", "deleteObject");
  const createBucketCapability = actionCapabilityState(workspace, "s3", "createBucket");
  const copyCapability = actionCapabilityState(workspace, "s3", "copyObject");
  const folderCapability = actionCapabilityState(workspace, "s3", "createFolderPrefix");
  const uploadCapability = actionCapabilityState(workspace, "s3", "uploadObject");
  const canUpload =
    uploadCapability.enabled &&
    Boolean(workspace.selectedS3BucketName) &&
    Boolean(uploadSourcePath) &&
    Boolean(uploadObjectKey) &&
    uploadAcknowledged;
  const uploadDisabledReason = canUpload
    ? undefined
    : actionDisabledReason(
        workspace,
        "s3",
        "uploadObject",
        !workspace.selectedS3BucketName
          ? "Select a bucket first."
          : !uploadSourcePath
            ? "Choose a local file to upload."
            : !uploadObjectKey
              ? "Enter a destination object key."
              : !uploadAcknowledged
                ? "Confirm the upload checklist before continuing."
                : undefined,
      );
  const [signedUrlAmount, setSignedUrlAmount] = useState(15);
  const [signedUrlUnit, setSignedUrlUnit] = useState<DurationUnit>("minutes");
  const signedUrlSeconds = Math.min(
    Math.max(Math.round(signedUrlAmount * UNIT_SECONDS[signedUrlUnit]), 1),
    MAX_PRESIGN_SECONDS,
  );
  const [urlTesterValue, setUrlTesterValue] = useState("");
  const [keySearch, setKeySearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(Boolean(workspace.selectedS3ObjectKey));
  const lastSelectedBucketRef = useRef(workspace.selectedS3BucketName || "");
  const lastSelectedObjectRef = useRef(workspace.selectedS3ObjectKey || "");
  const debouncedKeySearch = useDebouncedValue(keySearch, 200);

  useEffect(() => {
    const nextObjectKey = workspace.selectedS3ObjectKey || "";
    if (nextObjectKey !== lastSelectedObjectRef.current) {
      lastSelectedObjectRef.current = nextObjectKey;
      setDrawerOpen(Boolean(nextObjectKey));
    }
  }, [workspace.selectedS3ObjectKey]);

  useEffect(() => {
    const nextBucket = workspace.selectedS3BucketName || "";
    if (nextBucket !== lastSelectedBucketRef.current) {
      lastSelectedBucketRef.current = nextBucket;
      // Changing bucket always starts at root; drop local name filter from the previous bucket.
      setKeySearch("");
    }
  }, [workspace.selectedS3BucketName]);

  const visibleObjects = useMemo(
    () => filterObjectsByKeyQuery(workspace.s3Objects, debouncedKeySearch),
    [workspace.s3Objects, debouncedKeySearch],
  );
  const searchActive = debouncedKeySearch.trim().length > 0;
  const listSummary = s3ObjectListSummary(
    workspace.s3Objects.length,
    visibleObjects.length,
    searchActive,
  );

  useEffect(() => {
    if (!uploadObjectKey && uploadSourcePath) {
      setUploadObjectKey(defaultUploadKey(uploadSourcePath, workspace.s3PrefixFilter));
    }
  }, [uploadObjectKey, uploadSourcePath, workspace.s3PrefixFilter]);

  const chooseUploadFile = async () => {
    const selectedPath = await open({ multiple: false, directory: false });
    if (typeof selectedPath !== "string") {
      return;
    }
    setUploadSourcePath(selectedPath);
    setUploadObjectKey(defaultUploadKey(selectedPath, workspace.s3PrefixFilter));
    setUploadAcknowledged(false);
  };

  const selectedObject = workspace.s3Objects.find(
    (object) => object.key === workspace.selectedS3ObjectKey,
  );

  const metadataJson = JSON.stringify(
    {
      bucket: workspace.selectedS3BucketName,
      key: workspace.selectedS3ObjectKey,
      fields: Object.fromEntries(
        workspace.s3ObjectMetadata.map((field) => [
          field.label,
          field.sensitive && !showSensitiveValues ? "Hidden" : field.value,
        ]),
      ),
    },
    null,
    2,
  );
  const metadataCsv = [
    "label,value",
    ...workspace.s3ObjectMetadata.map((field) => {
      const value = field.sensitive && !showSensitiveValues ? "Hidden" : field.value;
      return `"${field.label.replaceAll("\"", "\"\"")}","${value.replaceAll("\"", "\"\"")}"`;
    }),
  ].join("\n");

  const objectKey = workspace.selectedS3ObjectKey ?? "";
  const bucketName = workspace.selectedS3BucketName ?? "";
  const s3Uri = bucketName ? `s3://${bucketName}/${objectKey}` : objectKey;
  const FileTypeIcon = objectFileIcon(objectKey);
  const pathParts = prefixSegments(workspace.s3PrefixFilter || "");

  const applyPrefix = (prefix: string) => {
    // Clear contains-search so a filter from the previous folder does not stick.
    setKeySearch("");
    onSetPrefixFilter(prefix.replace(/^\/+/, ""));
  };

  const breadcrumb = (
    <nav
      aria-label="S3 path"
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

  const drawerBody = selectedObject ? (
    <ResourceInspectorPanel>
      <ResourceInspectorHeader
        icon={FileTypeIcon}
        eyebrow="Object"
        title={objectFileName(objectKey)}
        onClose={() => setDrawerOpen(false)}
      />

      <div className="flex items-start gap-1 rounded-lg border border-border bg-muted/40 py-1.5 pl-3 pr-1.5">
        <code
          className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-muted-foreground"
          title={objectKey}
        >
          {objectKey}
        </code>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label="Copy object key"
          onClick={() => copyToClipboard(objectKey, "Object key copied")}
        >
          <Copy className="size-3.5" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {onCopyObject ? (
          <Button
            variant="outline"
            size="sm"
            disabled={!copyCapability.enabled}
            title={copyCapability.enabled ? undefined : copyCapability.reason}
            onClick={() => {
              setCopyDestinationKey(`${objectKey}-copy`);
              setCopyDialogOpen(true);
            }}
          >
            <Copy />
            Copy object
          </Button>
        ) : null}
        {onDeleteObject ? (
          <Button
            variant="destructive"
            size="sm"
            disabled={!deleteCapability.enabled}
            title={deleteCapability.enabled ? undefined : deleteCapability.reason}
            onClick={() => setPendingDeleteKey(objectKey)}
          >
            Delete object
          </Button>
        ) : null}
      </div>

      <Tabs defaultValue="overview" className="gap-3">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="px-1.5 text-xs">
            Overview
          </TabsTrigger>
          <TabsTrigger value="metadata" className="px-1.5 text-xs">
            Metadata
          </TabsTrigger>
          <TabsTrigger value="share" className="px-1.5 text-xs">
            Share
          </TabsTrigger>
          <TabsTrigger value="code" className="px-1.5 text-xs">
            Code
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <dl className="grid grid-cols-[max-content_1fr] items-baseline gap-x-5 gap-y-2.5">
            <dt className="text-xs text-muted-foreground">Size</dt>
            <dd className="text-right text-[13px] font-medium">{selectedObject.size || "Unknown"}</dd>
            <dt className="text-xs text-muted-foreground">Last modified</dt>
            <dd className="text-right text-[13px] font-medium">
              {selectedObject.modifiedAt || "Unknown"}
            </dd>
            <dt className="text-xs text-muted-foreground">Storage class</dt>
            <dd className="text-right">
              <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                {selectedObject.storageClass || "STANDARD"}
              </span>
            </dd>
          </dl>

          <div className="space-y-1.5">
            <div className={fieldLabel}>S3 URI</div>
            <div className="flex items-start gap-1 rounded-lg border border-border bg-muted/40 py-1.5 pl-3 pr-1.5">
              <code
                className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-muted-foreground"
                title={s3Uri}
              >
                {s3Uri}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label="Copy S3 URI"
                onClick={() => copyToClipboard(s3Uri, "S3 URI copied")}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => copyToClipboard(s3Uri, "S3 URI copied")}>
              <Copy />
              Copy S3 URI
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(objectKey, "Object key copied")}
            >
              <Copy />
              Copy key
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="metadata" className="space-y-3">
          {workspace.s3ObjectMetadata.length > 0 ? (
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Copy metadata as JSON"
                onClick={() => copyToClipboard(metadataJson, "Metadata JSON copied")}
              >
                <Copy />
                JSON
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Copy metadata as CSV"
                onClick={() => copyToClipboard(metadataCsv, "Metadata CSV copied")}
              >
                <Copy />
                CSV
              </Button>
            </div>
          ) : null}
          <DetailFieldList
            fields={workspace.s3ObjectMetadata}
            emptyText="No metadata loaded for the selected object."
            showSensitiveValues={showSensitiveValues}
          />
        </TabsContent>

        <TabsContent value="share" className="space-y-3">
          <div className={fieldLabel}>Signed link duration</div>
          <div className="flex flex-wrap gap-1">
            {SIGNED_URL_PRESETS.map((preset) => {
              const active = preset.amount === signedUrlAmount && preset.unit === signedUrlUnit;
              return (
                <Button
                  key={preset.label}
                  type="button"
                  variant={active ? "secondary" : "outline"}
                  size="sm"
                  aria-pressed={active}
                  onClick={() => {
                    setSignedUrlAmount(preset.amount);
                    setSignedUrlUnit(preset.unit);
                  }}
                >
                  {preset.label}
                </Button>
              );
            })}
          </div>
          <div className="flex items-end gap-2">
            <div className="w-20">
              <Input
                type="number"
                min={1}
                value={signedUrlAmount}
                aria-label="Signed link duration amount"
                onChange={(event) => {
                  setSignedUrlAmount(Math.max(1, Math.floor(Number(event.target.value) || 1)));
                }}
              />
            </div>
            <Select
              value={signedUrlUnit}
              onValueChange={(value) => {
                setSignedUrlUnit(value as DurationUnit);
              }}
            >
              <SelectTrigger className="w-32" aria-label="Signed link duration unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">Minutes</SelectItem>
                <SelectItem value="hours">Hours</SelectItem>
                <SelectItem value="days">Days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!workspace.selectedS3ObjectKey}
              onClick={() => {
                onPresignObject(signedUrlSeconds);
              }}
            >
              Generate
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Up to 7 days. A link cannot outlive the credentials that signed it.
          </p>
          {signedUrlStatus ? (
            <p className="text-xs text-muted-foreground">{signedUrlStatus}</p>
          ) : null}
          {signedUrlResult ? (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <span className={fieldLabel}>Signed link · expires {signedUrlResult.expiresAt}</span>
              <code
                className="block break-all rounded bg-background/60 p-2 font-mono text-xs leading-relaxed"
                title={signedUrlResult.url}
              >
                {signedUrlResult.url}
              </code>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => copyToClipboard(signedUrlResult.url, "Signed URL copied")}
                >
                  <Copy />
                  Copy link
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setUrlTesterValue(signedUrlResult.url);
                    setUrlToolsOpen(true);
                  }}
                >
                  <Link2 />
                  Inspect link
                </Button>
              </div>
              {signedUrlResult.effectiveWarning ? (
                <p className="text-xs text-muted-foreground">{signedUrlResult.effectiveWarning}</p>
              ) : null}
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="code" className="space-y-2">
          {workspace.s3ExportSnippets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No copy snippets are available for this object.
            </p>
          ) : (
            workspace.s3ExportSnippets.map((snippet) => (
              <div
                key={snippet.label}
                className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 py-1.5 pl-3 pr-1.5"
              >
                <div className="min-w-0 flex-1">
                  <div className={fieldLabel}>{snippet.label}</div>
                  <code
                    className="block break-all font-mono text-xs leading-relaxed"
                    title={snippet.value}
                  >
                    {snippet.value}
                  </code>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label={`Copy ${snippet.label}`}
                  onClick={() => copyToClipboard(snippet.value, `${snippet.label} copied`)}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </ResourceInspectorPanel>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">S3 Storage</h1>
          <p className="text-sm text-muted-foreground">
            {workspace.s3Buckets.length} bucket{workspace.s3Buckets.length === 1 ? "" : "s"} ·
            browse bucket / prefix / objects
          </p>
          {breadcrumb}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            status={uploadCapability.enabled ? "on" : "warning"}
            label={uploadCapability.enabled ? "Writes enabled" : "Read-only"}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!createBucketCapability.enabled || !onCreateBucket}
            title={createBucketCapability.enabled ? undefined : createBucketCapability.reason}
            onClick={() => setCreateDialogOpen(true)}
          >
            New bucket
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setUrlToolsOpen(true)}
          >
            <Link2 />
            Inspect URL
          </Button>
          <Button
            size="sm"
            disabled={!bucketName}
            onClick={() => {
              setUploadSourcePath("");
              setUploadObjectKey("");
              setUploadAcknowledged(false);
              setUploadOpen(true);
            }}
          >
            <Upload />
            Upload
          </Button>
        </div>
      </header>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="min-w-0">
            <div className={cn(fieldLabel, "mb-1")}>Bucket</div>
            <Select
              value={bucketName || undefined}
              onValueChange={(value) => value && onSelectBucket(value)}
              disabled={workspace.s3Buckets.length === 0 || listingLoading}
            >
              <SelectTrigger
                className="w-full"
                aria-label="Select bucket"
                title={bucketName || undefined}
              >
                <SelectValue
                  placeholder={
                    workspace.s3Buckets.length === 0 ? "No buckets loaded" : "Select bucket"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {workspace.s3Buckets.map((bucket) => (
                  <SelectItem key={bucket.name} value={bucket.name} title={bucket.name}>
                    {bucket.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <div className={cn(fieldLabel, "mb-1")}>Search in this folder (contains)</div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keySearch}
                placeholder="Filter loaded folders and files by name"
                disabled={!bucketName || listingLoading || workspace.s3Objects.length === 0}
                aria-label="Search object keys"
                className="pl-9"
                onChange={(event) => {
                  setKeySearch(event.target.value);
                }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Browse folders in the table to open a path. You do not need to type a prefix.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {listingLoading ? (
            <InventoryLoadingState variant="inline" label={listingLoadingLabel} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {workspace.s3StatusMessage || "S3 inventory is waiting for an open AWS workspace."}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!listingLoading ? (
              <span className="text-xs text-muted-foreground">{listSummary}</span>
            ) : null}
            {onCreateFolderPrefix ? (
              <Button
                variant="outline"
                size="sm"
                disabled={!folderCapability.enabled || !bucketName || listingLoading}
                title={folderCapability.enabled ? undefined : folderCapability.reason}
                onClick={() => {
                  setFolderPrefixDraft(workspace.s3PrefixFilter || "");
                  setFolderDialogOpen(true);
                }}
              >
                <FolderPlus />
                Folder
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {!bucketName || workspace.s3Buckets.length === 0 ? (
        <EmptyState
          icon={<Database />}
          title={workspace.s3Buckets.length === 0 ? "No buckets discovered" : "Select a bucket"}
          description={
            workspace.s3Buckets.length === 0
              ? workspace.s3StatusMessage ||
                "S3 inventory is waiting for an open AWS workspace."
              : "Choose a bucket above. Objects stay on this page."
          }
        />
      ) : listingLoading ? (
        <InventoryLoadingState variant="panel" label={listingLoadingLabel} />
      ) : (
        <ResourceInventoryShell
          table={
            <div className="space-y-2">
              <ResourceTable
                columns={[
                  {
                    id: "key",
                    label: "Name",
                    cellClassName: "max-w-0 truncate font-medium",
                  },
                  { id: "size", label: "Size", headerClassName: "w-28", cellClassName: "truncate" },
                  {
                    id: "modified",
                    label: "Modified",
                    headerClassName: "w-44",
                    cellClassName: "truncate",
                  },
                  {
                    id: "storageClass",
                    label: "Type",
                    headerClassName: "w-36",
                    cellClassName: "truncate",
                  },
                ]}
                rows={visibleObjects}
                selectedKey={workspace.selectedS3ObjectKey}
                getRowKey={(object) => object.key}
                onRowClick={(object) => {
                  if (object.isFolder) {
                    applyPrefix(object.key);
                    return;
                  }
                  onSelectObject(object.key);
                  setDrawerOpen(true);
                }}
                getCellTitle={(object, columnId) => (columnId === "key" ? object.key : undefined)}
                renderCell={(object, columnId) => {
                  if (columnId === "key") {
                    const label = s3EntryDisplayName(object.key, workspace.s3PrefixFilter || "");
                    if (object.isFolder) {
                      return (
                        <span className="inline-flex items-center gap-2">
                          <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                          <span>{label}/</span>
                        </span>
                      );
                    }
                    return label;
                  }
                  if (columnId === "size") {
                    return object.isFolder ? "—" : object.size || "Unknown";
                  }
                  if (columnId === "modified") {
                    return object.isFolder ? "—" : object.modifiedAt || "Unknown";
                  }
                  return object.isFolder ? "Folder" : object.storageClass || "STANDARD";
                }}
                emptyState={
                  <EmptyState
                    icon={<Database />}
                    title={searchActive ? "No matching names" : "Empty folder"}
                    description={
                      searchActive
                        ? `No loaded names contain “${debouncedKeySearch.trim()}”. Clear search or open another folder.`
                        : "This folder has no subfolders or objects. Use the breadcrumb to go up."
                    }
                    className="border-0"
                  />
                }
              />
              {workspace.s3ObjectsHasMore && onLoadMoreObjects ? (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    disabled={loadMoreInFlight}
                    onClick={() => onLoadMoreObjects()}
                  >
                    {loadMoreInFlight ? "Loading…" : "Load more"}
                  </Button>
                </div>
              ) : null}
            </div>
          }
          inspectorContent={drawerBody}
          inspectorOpen={drawerOpen}
          onInspectorOpenChange={setDrawerOpen}
          inspectorAriaLabel="S3 object details"
        />
      )}

      <Dialog open={urlToolsOpen} onOpenChange={setUrlToolsOpen}>
        <DialogContent className="max-h-[min(90vh,40rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inspect URL</DialogTitle>
            <DialogDescription>
              Paste a signed or public S3 URL to analyse or validate it. Does not depend on the
              selected bucket.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {signedUrlResult ? (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={fieldLabel}>
                    Latest signed URL · {signedUrlResult.objectKey}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setUrlTesterValue(signedUrlResult.url);
                    }}
                  >
                    Use this link
                  </Button>
                </div>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs">
                  {signedUrlResult.url}
                </pre>
              </div>
            ) : null}
            <div>
              <div className={cn(fieldLabel, "mb-1")}>URL</div>
              <Textarea
                value={urlTesterValue}
                placeholder="Paste an S3 signed URL or public object URL."
                className="min-h-24"
                onChange={(event) => {
                  setUrlTesterValue(event.target.value);
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!urlTesterValue.trim()}
                onClick={() => {
                  onAnalyseUrl(urlTesterValue);
                }}
              >
                Analyse
              </Button>
              <Button
                variant="outline"
                disabled={!urlTesterValue.trim()}
                onClick={() => {
                  onValidateUrl(urlTesterValue);
                }}
              >
                Validate
              </Button>
            </div>
            {urlInspection ? (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-sm font-medium">{urlInspection.summary}</p>
                <DetailFieldList
                  fields={urlInspection.detailFields}
                  emptyText="No URL details available."
                />
              </div>
            ) : null}
            {urlValidation ? (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <StatusPill
                  status={urlValidation.succeeded ? "on" : "error"}
                  label={urlValidation.summary}
                />
                <DetailFieldList
                  fields={urlValidation.detailFields}
                  emptyText="No validation details available."
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUrlToolsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Upload object</AlertDialogTitle>
            <AlertDialogDescription>
              Upload into {bucketName || "bucket"}
              {workspace.s3PrefixFilter ? ` (prefix ${workspace.s3PrefixFilter})` : ""}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className={fieldLabel}>Write policy</div>
                <StatusPill
                  status={uploadCapability.enabled ? "on" : "warning"}
                  label={uploadCapability.enabled ? "Writes enabled" : "Read-only"}
                />
              </div>
              <div>
                <div className={fieldLabel}>Endpoint</div>
                <p className="truncate">{workspace.awsEndpointUrl || "Default AWS endpoint"}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                value={uploadSourcePath}
                placeholder="Local file path"
                onChange={(event) => {
                  setUploadSourcePath(event.target.value);
                  setUploadAcknowledged(false);
                  if (!uploadObjectKey) {
                    setUploadObjectKey(
                      defaultUploadKey(event.target.value, workspace.s3PrefixFilter),
                    );
                  }
                }}
              />
              <Button
                variant="outline"
                onClick={() => {
                  void chooseUploadFile();
                }}
              >
                <FolderOpen />
                Browse
              </Button>
            </div>
            <Input
              value={uploadObjectKey}
              placeholder="Destination object key"
              onChange={(event) => {
                setUploadObjectKey(event.target.value);
                setUploadAcknowledged(false);
              }}
            />
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={uploadAcknowledged}
                disabled={
                  !uploadCapability.enabled ||
                  !workspace.selectedS3BucketName ||
                  !uploadSourcePath ||
                  !uploadObjectKey
                }
                onChange={(event) => {
                  setUploadAcknowledged(event.target.checked);
                }}
                className="mt-0.5 size-4 accent-[color:var(--primary)]"
              />
              <span>
                I have checked the selected bucket, destination key, local endpoint, and source
                file.
              </span>
            </label>
            {uploadDisabledReason ? (
              <p className="text-xs text-muted-foreground">{uploadDisabledReason}</p>
            ) : null}
            <p className="text-sm text-muted-foreground">{uploadStatus}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canUpload}
              title={uploadDisabledReason}
              onClick={() => {
                onUploadObject(uploadSourcePath, uploadObjectKey);
                setUploadAcknowledged(false);
                setUploadOpen(false);
              }}
            >
              Upload
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDeleteKey !== undefined}
        onOpenChange={(open) => !open && setPendingDeleteKey(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete object?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {pendingDeleteKey} from the bucket.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteKey && onDeleteObject) {
                  onDeleteObject(pendingDeleteKey);
                }
                setPendingDeleteKey(undefined);
              }}
            >
              Delete object
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create bucket</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a bucket name for your local endpoint profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={newBucketName}
            placeholder="my-bucket"
            onChange={(event) => setNewBucketName(event.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!newBucketName.trim()}
              onClick={() => {
                if (onCreateBucket && newBucketName.trim()) {
                  onCreateBucket(newBucketName.trim());
                  setNewBucketName("");
                  setCreateDialogOpen(false);
                }
              }}
            >
              Create bucket
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copy object</AlertDialogTitle>
            <AlertDialogDescription>
              Copy {workspace.selectedS3ObjectKey} to a new key in the same bucket.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={copyDestinationKey}
            placeholder="archive/readme-copy.txt"
            onChange={(event) => setCopyDestinationKey(event.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!copyDestinationKey.trim() || !workspace.selectedS3ObjectKey}
              onClick={() => {
                if (onCopyObject && workspace.selectedS3ObjectKey && copyDestinationKey.trim()) {
                  onCopyObject(workspace.selectedS3ObjectKey, copyDestinationKey.trim());
                  setCopyDialogOpen(false);
                }
              }}
            >
              Copy object
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
