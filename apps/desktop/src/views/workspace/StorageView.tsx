import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Copy, Database, FolderOpen, Upload, X } from "lucide-react";

import { cn } from "@/lib/utils";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
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

function copyToClipboard(value: string): void {
  if (navigator.clipboard) {
    void navigator.clipboard.writeText(value);
  }
}

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

  const [uploadSourcePath, setUploadSourcePath] = useState("");
  const [uploadObjectKey, setUploadObjectKey] = useState("");
  const [uploadAcknowledged, setUploadAcknowledged] = useState(false);
  const [signedUrlDuration, setSignedUrlDuration] = useState("900");
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
          description={workspace.s3StatusMessage || "S3 inventory is waiting for a locked AWS workspace."}
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

  const objectDrawer =
    selectedObject && drawerOpen ? (
      <aside
        aria-label="S3 object details"
        className="w-[360px] shrink-0 space-y-5 self-start rounded-lg border border-border bg-card p-5 shadow-sm"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className={fieldLabel}>Selected object</div>
            <h2 className="text-base font-bold">Object Detail</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close object detail"
            onClick={() => {
              setDrawerOpen(false);
            }}
          >
            <X />
          </Button>
        </div>

        <div>
          <div className={fieldLabel}>Object key</div>
          <p className="break-all text-sm">{workspace.selectedS3ObjectKey}</p>
        </div>

        <div className="space-y-2">
          <div className={fieldLabel}>Metadata</div>
          <DetailFieldList
            fields={workspace.s3ObjectMetadata}
            emptyText="No metadata loaded for the selected object."
            showSensitiveValues={showSensitiveValues}
          />
          {workspace.s3ObjectMetadata.length > 0 ? (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => copyToClipboard(metadataJson)}>
                Copy Metadata JSON
              </Button>
              <Button variant="ghost" size="sm" onClick={() => copyToClipboard(metadataCsv)}>
                Copy Metadata CSV
              </Button>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className={fieldLabel}>Copy snippets</div>
          {workspace.s3ExportSnippets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No copy snippets are available for this object.
            </p>
          ) : (
            workspace.s3ExportSnippets.map((snippet) => (
              <div key={snippet.label} className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={fieldLabel}>{snippet.label}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(snippet.value)}
                  >
                    <Copy />
                    Copy
                  </Button>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs">{snippet.value}</pre>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2">
          <div className={fieldLabel}>Signed URL</div>
          <Input
            value={signedUrlDuration}
            placeholder="Duration in seconds"
            onChange={(event) => {
              setSignedUrlDuration(event.target.value.replace(/\D/g, ""));
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!workspace.selectedS3ObjectKey}
            onClick={() => {
              onPresignObject(Number(signedUrlDuration || "3600"));
            }}
          >
            Generate Signed URL
          </Button>
          <p className="text-xs text-muted-foreground">{signedUrlStatus}</p>
          {signedUrlResult ? (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className={fieldLabel}>Expires {signedUrlResult.expiresAt}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(signedUrlResult.url)}
                >
                  Copy URL
                </Button>
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs">{signedUrlResult.url}</pre>
              {signedUrlResult.effectiveWarning ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {signedUrlResult.effectiveWarning}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    ) : null;

  const objectsPage = (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="w-56">
          <div className={cn(fieldLabel, "mb-1")}>Bucket</div>
          <Select
            value={workspace.selectedS3BucketName ?? ""}
            onValueChange={(value) => {
              if (value) {
                onSelectBucket(value);
              }
            }}
          >
            <SelectTrigger aria-label="Select bucket">
              <SelectValue placeholder="Select bucket" />
            </SelectTrigger>
            <SelectContent>
              {workspace.s3Buckets.map((bucket) => (
                <SelectItem key={bucket.name} value={bucket.name}>
                  {bucket.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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

      <p className="text-sm text-muted-foreground">
        {workspace.s3StatusMessage || "S3 inventory is waiting for a locked AWS workspace."}
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Object Key</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Modified</TableHead>
                  <TableHead>Storage Class</TableHead>
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
                      <TableCell className="font-medium">{object.key}</TableCell>
                      <TableCell>{object.size || "Unknown"}</TableCell>
                      <TableCell>{object.modifiedAt || "Unknown"}</TableCell>
                      <TableCell>{object.storageClass || "STANDARD"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
        {objectDrawer}
      </div>
    </section>
  );

  const uploadPage = (
    <section className="max-w-3xl space-y-5 rounded-lg border border-border bg-card p-5 shadow-sm">
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
            status={workspace.awsWritesEnabled ? "on" : "warning"}
            label={workspace.awsWritesEnabled ? "Writes enabled" : "Read-only"}
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
            !workspace.awsWritesEnabled ||
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
        disabled={
          !workspace.awsWritesEnabled ||
          !workspace.selectedS3BucketName ||
          !uploadSourcePath ||
          !uploadObjectKey ||
          !uploadAcknowledged
        }
        onClick={() => {
          onUploadObject(uploadSourcePath, uploadObjectKey);
          setUploadAcknowledged(false);
        }}
      >
        <Upload />
        Upload
      </Button>
      <p className="text-sm text-muted-foreground">{uploadStatus}</p>
    </section>
  );

  const inspectPage = (
    <section className="max-w-3xl space-y-5 rounded-lg border border-border bg-card p-5 shadow-sm">
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
