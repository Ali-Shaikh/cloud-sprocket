// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Copy,
  Database,
  File as FileIcon,
  FileArchive,
  FileCode,
  FileImage,
  FileText,
  FolderOpen,
  Upload,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { useDebouncedValue } from "@/lib/use-debounced-value";
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
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import { actionCapabilityState, actionDisabledReason } from "@/lib/action-capabilities";
import { DetailFieldList } from "./detail-fields";
import awsS3IconUrl from "@/assets/cloud-icons/aws-s3.svg";
import type {
  AwsS3PresignResult,
  UrlInspection,
  UrlValidationResult,
  WorkspaceSnapshot,
} from "@/types/backend";

export type StoragePageId = "buckets" | "objects" | "upload" | "inspect";

export type StorageViewProps = {
  workspace: WorkspaceSnapshot;
  /** Raw sub-page id from the nav; unknown values fall back to "objects". */
  activePageId: string;
  onNavigatePage: (pageId: StoragePageId) => void;
  showSensitiveValues: boolean;
  onSelectBucket: (bucketName: string) => void;
  onSelectObject: (objectKey: string) => void;
  onSetPrefixFilter: (prefix: string) => void;
  uploadStatus: string;
  signedUrlStatus: string;
  signedUrlResult?: AwsS3PresignResult;
  urlInspection?: UrlInspection;
  urlValidation?: UrlValidationResult;
  onUploadObject: (sourcePath: string, objectKey: string) => void;
  onPresignObject: (durationSeconds: number) => void;
  onAnalyseUrl: (url: string) => void;
  onValidateUrl: (url: string) => void;
};

function normalisePageId(pageId: string): StoragePageId {
  if (pageId === "buckets" || pageId === "upload" || pageId === "inspect") {
    return pageId;
  }
  // "url-tester" was the legacy id for the URL tools page.
  if (pageId === "url-tester") {
    return "inspect";
  }
  return "objects";
}

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

/** Last path segment of an S3 key, used as the drawer title. */
function objectFileName(key: string): string {
  const segments = key.split("/").filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : key;
}

/** Picks a lucide file icon from the object key's extension. */
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

/**
 * Tracks whether the viewport is wide enough (>= Tailwind's xl breakpoint) to
 * dock the object details inline beside the table. Below it we float the same
 * panel in a Sheet so the table is never crushed.
 */
function useIsWideViewport(): boolean {
  const [isWide, setIsWide] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 1280,
  );
  useEffect(() => {
    const onResize = () => {
      setIsWide(window.innerWidth >= 1280);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return isWide;
}

type DurationUnit = "minutes" | "hours" | "days";

const UNIT_SECONDS: Record<DurationUnit, number> = {
  minutes: 60,
  hours: 3600,
  days: 86400,
};

// AWS SigV4 presigned URLs are valid for at most 7 days.
const MAX_PRESIGN_SECONDS = 7 * 86400;

const SIGNED_URL_PRESETS: { label: string; amount: number; unit: DurationUnit }[] = [
  { label: "15 min", amount: 15, unit: "minutes" },
  { label: "1 hour", amount: 1, unit: "hours" },
  { label: "12 hours", amount: 12, unit: "hours" },
  { label: "7 days", amount: 7, unit: "days" },
];

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

/**
 * M5a Storage: Tailwind replacement for the Cloudscape S3 tab. Bucket cards,
 * the object browser with a details drawer, the upload form, and the URL
 * inspector, switched by the contextual nav's sub-page id.
 */
export default function StorageView({
  workspace,
  activePageId,
  onNavigatePage,
  showSensitiveValues,
  onSelectBucket,
  onSelectObject,
  onSetPrefixFilter,
  uploadStatus,
  signedUrlStatus,
  signedUrlResult,
  urlInspection,
  urlValidation,
  onUploadObject,
  onPresignObject,
  onAnalyseUrl,
  onValidateUrl,
}: StorageViewProps) {
  const page = normalisePageId(activePageId);
  const isWideViewport = useIsWideViewport();

  const [uploadSourcePath, setUploadSourcePath] = useState("");
  const [uploadObjectKey, setUploadObjectKey] = useState("");
  const [uploadAcknowledged, setUploadAcknowledged] = useState(false);
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
  const [prefixDraft, setPrefixDraft] = useState(workspace.s3PrefixFilter || "");
  const [drawerOpen, setDrawerOpen] = useState(Boolean(workspace.selectedS3ObjectKey));
  const lastSelectedBucketRef = useRef(workspace.selectedS3BucketName || "");
  const lastRequestedPrefixRef = useRef(workspace.s3PrefixFilter || "");
  const lastSelectedObjectRef = useRef(workspace.selectedS3ObjectKey || "");
  const debouncedPrefixDraft = useDebouncedValue(prefixDraft, 350);

  // Open or close the drawer when the backend-selected object changes.
  useEffect(() => {
    const nextObjectKey = workspace.selectedS3ObjectKey || "";
    if (nextObjectKey !== lastSelectedObjectRef.current) {
      lastSelectedObjectRef.current = nextObjectKey;
      setDrawerOpen(Boolean(nextObjectKey));
    }
  }, [workspace.selectedS3ObjectKey]);

  // Switching bucket resets the prefix draft to the workspace value.
  useEffect(() => {
    const nextBucket = workspace.selectedS3BucketName || "";
    if (nextBucket !== lastSelectedBucketRef.current) {
      const nextPrefix = workspace.s3PrefixFilter || "";
      lastSelectedBucketRef.current = nextBucket;
      setPrefixDraft(nextPrefix);
      lastRequestedPrefixRef.current = nextPrefix;
    }
  }, [workspace.s3PrefixFilter, workspace.selectedS3BucketName]);

  // Push the debounced prefix to the backend once it differs from the last request.
  useEffect(() => {
    if (debouncedPrefixDraft !== lastRequestedPrefixRef.current) {
      lastRequestedPrefixRef.current = debouncedPrefixDraft;
      onSetPrefixFilter(debouncedPrefixDraft);
    }
  }, [debouncedPrefixDraft, onSetPrefixFilter]);

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

  const bucketsPage = (
    <section className="space-y-4">
      {workspace.s3Buckets.length === 0 ? (
        <EmptyState
          icon={<Database />}
          title="No buckets discovered"
          description={workspace.s3StatusMessage || "S3 inventory is waiting for an open AWS workspace."}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {workspace.s3Buckets.map((bucket) => {
            const active = bucket.name === workspace.selectedS3BucketName;
            return (
              <button
                key={bucket.name}
                type="button"
                onClick={() => {
                  onSelectBucket(bucket.name);
                  onNavigatePage("objects");
                }}
                className={cn(
                  "flex flex-col gap-3 rounded-lg border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                  active ? "border-primary ring-1 ring-primary" : "border-border hover:border-border-strong",
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-muted">
                    <img src={awsS3IconUrl} alt="" className="size-6 object-contain" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">{bucket.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {bucket.createdAt ? `Created ${bucket.createdAt}` : "S3 bucket"}
                    </div>
                  </div>
                </div>
                {bucket.summary ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{bucket.summary}</p>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );

  const objectKey = workspace.selectedS3ObjectKey ?? "";
  const bucketName = workspace.selectedS3BucketName ?? "";
  const s3Uri = bucketName ? `s3://${bucketName}/${objectKey}` : objectKey;
  const FileTypeIcon = objectFileIcon(objectKey);

  const closeDrawer = () => {
    setDrawerOpen(false);
  };

  const drawerBody = selectedObject ? (
    <div className="space-y-4">
      {/* Shared header: file icon, name (wraps), full key, close. */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[10px] bg-muted [&_svg]:size-5 [&_svg]:text-muted-foreground">
          <FileTypeIcon />
        </div>
        <div className="min-w-0 flex-1">
          <div className={fieldLabel}>Object</div>
          <h2 className="break-words text-[15px] font-bold leading-tight" title={objectFileName(objectKey)}>
            {objectFileName(objectKey)}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label="Close object detail"
          onClick={closeDrawer}
        >
          <X />
        </Button>
      </div>

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

      <Tabs defaultValue="overview" className="gap-3">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="px-1.5 text-xs">Overview</TabsTrigger>
          <TabsTrigger value="metadata" className="px-1.5 text-xs">Metadata</TabsTrigger>
          <TabsTrigger value="share" className="px-1.5 text-xs">Share</TabsTrigger>
          <TabsTrigger value="code" className="px-1.5 text-xs">Code</TabsTrigger>
        </TabsList>

        {/* Overview: the three real object facts, the S3 URI, and copy actions. */}
        <TabsContent value="overview" className="space-y-4">
          <dl className="grid grid-cols-[max-content_1fr] items-baseline gap-x-5 gap-y-2.5">
            <dt className="text-xs text-muted-foreground">Size</dt>
            <dd className="text-right text-[13px] font-medium">{selectedObject.size || "Unknown"}</dd>
            <dt className="text-xs text-muted-foreground">Last modified</dt>
            <dd className="text-right text-[13px] font-medium">{selectedObject.modifiedAt || "Unknown"}</dd>
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

        {/* Metadata: the object's HEAD response (content type, ETag, custom keys). */}
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

        {/* Share: generate a time-limited signed link of any duration. */}
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
              <Button
                size="sm"
                onClick={() => copyToClipboard(signedUrlResult.url, "Signed URL copied")}
              >
                <Copy />
                Copy link
              </Button>
              {signedUrlResult.effectiveWarning ? (
                <p className="text-xs text-muted-foreground">{signedUrlResult.effectiveWarning}</p>
              ) : null}
            </div>
          ) : null}
        </TabsContent>

        {/* Code: ready-to-paste CLI / SDK snippets. */}
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
                  <code className="block break-all font-mono text-xs leading-relaxed" title={snippet.value}>
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
    </div>
  ) : null;

  // On wide viewports the panel docks beside the table; otherwise it floats in
  // a Sheet so the objects table is never squeezed.
  const inlineDrawer =
    isWideViewport && selectedObject && drawerOpen ? (
      <aside
        aria-label="S3 object details"
        className="sticky top-4 max-h-[calc(100vh-7rem)] w-[360px] shrink-0 self-start overflow-y-auto rounded-lg border border-border bg-card p-[18px] shadow-sm"
      >
        {drawerBody}
      </aside>
    ) : null;

  const sheetDrawer =
    !isWideViewport && selectedObject ? (
      <Sheet
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
        }}
      >
        <SheetContent
          aria-label="S3 object details"
          className="w-full gap-0 overflow-y-auto p-[18px] sm:max-w-md [&>button]:hidden"
        >
          {drawerBody}
        </SheetContent>
      </Sheet>
    ) : null;

  const objectsPage = (
    <section className="space-y-4">
      <div className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        {/* Bucket gets its own full-width row so long names stay on one line. */}
        <div>
          <div className={cn(fieldLabel, "mb-1")}>Bucket</div>
          <Select
            value={workspace.selectedS3BucketName ?? ""}
            onValueChange={(value) => {
              if (value) {
                onSelectBucket(value);
              }
            }}
          >
            <SelectTrigger
              className="w-full"
              aria-label="Select bucket"
              title={workspace.selectedS3BucketName ?? undefined}
            >
              <SelectValue placeholder="Select bucket" />
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
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <div className={cn(fieldLabel, "mb-1")}>Prefix filter</div>
            <Input
              value={prefixDraft}
              placeholder="Filter by prefix, for example reports/"
              onChange={(event) => {
                setPrefixDraft(event.target.value);
              }}
            />
          </div>
          <div className="pb-2 text-xs text-muted-foreground">
            {workspace.s3Objects.length} object{workspace.s3Objects.length === 1 ? "" : "s"}
            {prefixDraft !== (workspace.s3PrefixFilter || "")
              ? " · updating after typing pauses"
              : ""}
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {workspace.s3StatusMessage || "S3 inventory is waiting for an open AWS workspace."}
      </p>

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          {workspace.s3Objects.length === 0 ? (
            <EmptyState
              icon={<Database />}
              title="No objects"
              description="No S3 objects loaded for the selected bucket."
              className="border-0"
            />
          ) : (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead>Object Key</TableHead>
                  <TableHead className="w-28">Size</TableHead>
                  <TableHead className="w-44">Modified</TableHead>
                  <TableHead className="w-36">Storage Class</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workspace.s3Objects.map((object) => {
                  const active = object.key === workspace.selectedS3ObjectKey;
                  return (
                    <TableRow
                      key={object.key}
                      data-state={active ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={() => {
                        onSelectObject(object.key);
                        setDrawerOpen(true);
                      }}
                    >
                      <TableCell className="max-w-0 truncate font-medium" title={object.key}>
                        {object.key}
                      </TableCell>
                      <TableCell className="truncate">{object.size || "Unknown"}</TableCell>
                      <TableCell className="truncate">{object.modifiedAt || "Unknown"}</TableCell>
                      <TableCell className="truncate">{object.storageClass || "STANDARD"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
        {inlineDrawer}
      </div>
      {sheetDrawer}
    </section>
  );

  const uploadPage = (
    <section className="max-w-3xl space-y-5 rounded-lg border border-border bg-card p-[18px] shadow-sm">
      <p className="text-sm text-muted-foreground">
        Upload a local file into the selected bucket and prefix. Uploads use the Go daemon and
        the AWS SDK transfer manager.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <div className={fieldLabel}>Target bucket</div>
          <p className="truncate text-sm">{workspace.selectedS3BucketName || "Select a bucket first"}</p>
        </div>
        <div>
          <div className={fieldLabel}>Current prefix</div>
          <p className="truncate text-sm">{workspace.s3PrefixFilter || "Bucket root"}</p>
        </div>
        <div>
          <div className={fieldLabel}>Write policy</div>
          <StatusPill
            status={uploadCapability.enabled ? "on" : "warning"}
            label={uploadCapability.enabled ? "Writes enabled" : "Read-only"}
          />
        </div>
        <div>
          <div className={fieldLabel}>Endpoint</div>
          <p className="truncate text-sm">{workspace.awsEndpointUrl || "Default AWS endpoint"}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          value={uploadSourcePath}
          placeholder="Local file path, for example D:\Downloads\report.csv"
          onChange={(event) => {
            setUploadSourcePath(event.target.value);
            setUploadAcknowledged(false);
            if (!uploadObjectKey) {
              setUploadObjectKey(defaultUploadKey(event.target.value, workspace.s3PrefixFilter));
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
          Browse...
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
          I have checked the selected bucket, destination key, local endpoint, and source file.
        </span>
      </label>
      <p className="text-xs text-muted-foreground">
        Uploads are accepted only when the backend sees a local endpoint profile with explicit
        write opt-in. The daemon rejects directories, hidden absolute object keys, control
        characters, dot path segments, and files above 512 MiB.
      </p>

      <Button
        disabled={!canUpload}
        title={uploadDisabledReason}
        onClick={() => {
          onUploadObject(uploadSourcePath, uploadObjectKey);
          setUploadAcknowledged(false);
        }}
      >
        <Upload />
        Upload
      </Button>
      {uploadDisabledReason ? (
        <p className="text-xs text-muted-foreground">{uploadDisabledReason}</p>
      ) : null}
      <p className="text-sm text-muted-foreground">{uploadStatus}</p>
    </section>
  );

  const inspectPage = (
    <section className="max-w-3xl space-y-5 rounded-lg border border-border bg-card p-[18px] shadow-sm">
      <p className="text-sm text-muted-foreground">
        Inspect a pasted S3 signed URL or public object URL, then optionally make a range
        request. URL tools do not require the current bucket selection.
      </p>
      {signedUrlResult ? (
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className={fieldLabel}>
              Latest signed URL for {signedUrlResult.objectKey}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setUrlTesterValue(signedUrlResult.url);
              }}
            >
              Use latest signed URL
            </Button>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs">{signedUrlResult.url}</pre>
        </div>
      ) : null}
      <Textarea
        value={urlTesterValue}
        placeholder="Paste an S3 signed URL or public object URL."
        onChange={(event) => {
          setUrlTesterValue(event.target.value);
        }}
      />
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={!urlTesterValue}
          onClick={() => {
            onAnalyseUrl(urlTesterValue);
          }}
        >
          Analyse
        </Button>
        <Button
          variant="outline"
          disabled={!urlTesterValue}
          onClick={() => {
            onValidateUrl(urlTesterValue);
          }}
        >
          Validate
        </Button>
      </div>
      {urlInspection ? (
        <div className="space-y-2">
          <p className="text-sm">{urlInspection.summary}</p>
          <DetailFieldList
            fields={urlInspection.detailFields}
            emptyText="No URL details available."
          />
        </div>
      ) : null}
      {urlValidation ? (
        <div className="space-y-2">
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
    </section>
  );

  const pageTitles: Record<StoragePageId, string> = {
    buckets: "Buckets",
    objects: "Objects",
    upload: "Upload",
    inspect: "Inspect URL",
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Storage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspace.s3Buckets.length} bucket{workspace.s3Buckets.length === 1 ? "" : "s"}
          {workspace.selectedS3BucketName ? ` · ${workspace.selectedS3BucketName}` : ""} ·{" "}
          {pageTitles[page]}
        </p>
      </header>
      {page === "buckets" ? bucketsPage : null}
      {page === "objects" ? objectsPage : null}
      {page === "upload" ? uploadPage : null}
      {page === "inspect" ? inspectPage : null}
    </div>
  );
}
