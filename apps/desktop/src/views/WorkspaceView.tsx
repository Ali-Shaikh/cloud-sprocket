import {
  Box,
  Button,
  Checkbox,
  Container,
  Header,
  Input,
  PropertyFilter,
  Select,
  SpaceBetween,
  StatusIndicator,
  Table,
  Textarea,
} from "@cloudscape-design/components";
import { open } from "@tauri-apps/plugin-dialog";
import type { PropertyFilterProps, TableProps } from "@cloudscape-design/components";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ActivityLogEntry,
  AzureResourceGroup,
  AzureVirtualMachine,
  AwsEc2Instance,
  AwsS3PresignResult,
  AwsS3Object,
  DetailField,
  JobLifecycle,
  SessionSnapshot,
  UrlInspection,
  UrlValidationResult,
  WorkspaceSnapshot,
} from "../types/backend";
import {
  type CollectionField,
  countLabel,
  defaultQuery,
  filterCollection,
  makeFilteringOptions,
  propertyFilterStrings,
  renderLogEntries,
  renderProfileDetailPanel,
  renderRuntimeSettingsPanel,
  statusType,
  useDebouncedValue,
} from "./shared";

type EC2LifecycleAction = "start" | "stop" | "reboot";

type EC2ActionHistoryItem = {
  jobId: string;
  status: JobLifecycle;
  message: string;
  completedAt?: string;
};

type Props = {
  session: SessionSnapshot;
  workspace: WorkspaceSnapshot;
  logs: ActivityLogEntry[];
  latestLog?: ActivityLogEntry;
  activeTabId: string;
  activeS3PageId: string;
  activeAzurePageId: string;
  splitPanelOpen: boolean;
  showSensitiveValues: boolean;
  onToggleSplitPanel: () => void;
  onRefreshDiscovery: () => void;
  onUnlockSession: () => void;
  onToggleSensitiveValues: () => void;
  onInvokeWorkspaceAction: (actionId: "refresh") => void;
  onSelectS3Bucket: (bucketName: string) => void;
  onSelectS3Object: (objectKey: string) => void;
  onSetS3PrefixFilter: (prefix: string) => void;
  s3UploadStatus: string;
  s3SignedUrlStatus: string;
  s3SignedUrlResult?: AwsS3PresignResult;
  s3UrlInspection?: UrlInspection;
  s3UrlValidation?: UrlValidationResult;
  onUploadS3Object: (sourcePath: string, objectKey: string) => void;
  onPresignS3Object: (durationSeconds: number) => void;
  onAnalyseS3Url: (url: string) => void;
  onValidateS3Url: (url: string) => void;
  ec2ActionStatus: string;
  ec2ActionInFlight: boolean;
  ec2ActionHistory: EC2ActionHistoryItem[];
  onRefreshEC2Instances: () => void;
  onSelectEC2Region: (region: string) => void;
  onSelectEC2Instance: (instanceId: string) => void;
  onInvokeEC2Action: (action: EC2LifecycleAction, instanceId: string) => void;
  onSelectAzureResourceGroup: (resourceGroup: string) => void;
  onSelectAzureVirtualMachine: (vmId: string) => void;
};

function defaultUploadKey(sourcePath: string, prefix?: string): string {
  const fileName = sourcePath.split(/[\\/]/).filter(Boolean).pop() ?? "";
  const cleanPrefix = (prefix ?? "").replace(/^\/+/, "");
  if (!cleanPrefix) {
    return fileName;
  }
  return `${cleanPrefix.replace(/\/?$/, "/")}${fileName}`;
}

function renderDetailFields(fields: DetailField[] = [], emptyText: string, showSensitiveValues = true) {
  if (fields.length === 0) {
    return <Box color="text-status-inactive">{emptyText}</Box>;
  }
  return (
    <div className="detail-grid">
      {fields.map((field) => (
        <div
          key={`${field.label}-${field.value}`}
          className="detail-card"
        >
          <Box variant="awsui-key-label">{field.label}</Box>
          <Box variant="p">{field.sensitive && !showSensitiveValues ? "Hidden" : field.value}</Box>
        </div>
      ))}
    </div>
  );
}

function detailFieldsAsObject(fields: DetailField[], showSensitiveValues: boolean): Record<string, string> {
  return Object.fromEntries(
    fields.map((field) => [
      field.label,
      field.sensitive && !showSensitiveValues ? "Hidden" : field.value,
    ]),
  );
}

function renderMetricCard(label: string, value: string, detail: string) {
  return (
    <div className="workspace-metric-card">
      <Box variant="awsui-key-label">{label}</Box>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

function copyToClipboard(value: string): void {
  if (navigator.clipboard) {
    void navigator.clipboard.writeText(value);
  }
}

function instanceStateType(state?: string): "success" | "warning" | "error" | "info" {
  if (state === "running") {
    return "success";
  }
  if (state === "stopped" || state === "stopping") {
    return "warning";
  }
  if (state === "terminated" || state === "shutting-down") {
    return "error";
  }
  return "info";
}

function jobStatusType(status: JobLifecycle): "success" | "warning" | "error" | "info" | "loading" {
  if (status === "completed") {
    return "success";
  }
  if (status === "failed") {
    return "error";
  }
  if (status === "running" || status === "queued") {
    return "loading";
  }
  return "info";
}

function ec2Command(region: string | undefined, action: string, instanceId: string): string {
  const regionFlag = region ? ` --region ${region}` : "";
  return `aws ec2 ${action}-instances --instance-ids ${instanceId}${regionFlag}`;
}

function ec2ConsoleUrl(region: string | undefined, instanceId: string): string {
  const consoleRegion = region || "us-east-1";
  return `https://${consoleRegion}.console.aws.amazon.com/ec2/home?region=${consoleRegion}#InstanceDetails:instanceId=${instanceId}`;
}

function joinedValues(values: string[] | undefined, emptyText = "Unavailable"): string {
  return values && values.length > 0 ? values.join(", ") : emptyText;
}

function ec2TagValues(tags: AwsEc2Instance["tags"]): string {
  if (!tags || tags.length === 0) {
    return "No tags returned";
  }
  return tags.map((tag) => `${tag.label}=${tag.value}`).join(", ");
}

function profileFieldValue(profile: WorkspaceSnapshot["profile"], label: string): string | undefined {
  return profile?.attributes.find((field) => field.label.toLowerCase() === label.toLowerCase())?.value;
}

function azureStatusType(value?: string): "success" | "warning" | "error" | "info" {
  const normalised = value?.toLowerCase() ?? "";
  if (normalised === "succeeded" || normalised === "running") {
    return "success";
  }
  if (normalised === "stopped" || normalised === "deallocated") {
    return "warning";
  }
  if (normalised === "failed") {
    return "error";
  }
  return "info";
}

export default function WorkspaceView({
  session,
  workspace,
  logs,
  latestLog,
  activeTabId,
  activeS3PageId,
  activeAzurePageId,
  splitPanelOpen,
  showSensitiveValues,
  onToggleSplitPanel,
  onRefreshDiscovery,
  onUnlockSession,
  onToggleSensitiveValues,
  onInvokeWorkspaceAction,
  onSelectS3Bucket,
  onSelectS3Object,
  onSetS3PrefixFilter,
  s3UploadStatus,
  s3SignedUrlStatus,
  s3SignedUrlResult,
  s3UrlInspection,
  s3UrlValidation,
  onUploadS3Object,
  onPresignS3Object,
  onAnalyseS3Url,
  onValidateS3Url,
  ec2ActionStatus,
  ec2ActionInFlight,
  ec2ActionHistory,
  onRefreshEC2Instances,
  onSelectEC2Region,
  onSelectEC2Instance,
  onInvokeEC2Action,
  onSelectAzureResourceGroup,
  onSelectAzureVirtualMachine,
}: Props) {
  const [uploadSourcePath, setUploadSourcePath] = useState("");
  const [uploadObjectKey, setUploadObjectKey] = useState("");
  const [uploadAcknowledged, setUploadAcknowledged] = useState(false);
  const [signedUrlDurationSeconds, setSignedUrlDurationSeconds] = useState("900");
  const [urlTesterValue, setUrlTesterValue] = useState("");
  const [s3PrefixDraft, setS3PrefixDraft] = useState(workspace.s3PrefixFilter || "");
  const [s3ObjectDrawerOpen, setS3ObjectDrawerOpen] = useState(Boolean(workspace.selectedS3ObjectKey));
  const lastSelectedS3BucketRef = useRef(workspace.selectedS3BucketName || "");
  const lastRequestedS3PrefixRef = useRef(workspace.s3PrefixFilter || "");
  const lastSelectedS3ObjectRef = useRef(workspace.selectedS3ObjectKey || "");
  const debouncedS3PrefixDraft = useDebouncedValue(s3PrefixDraft, 350);
  const [ec2Query, setEC2Query] = useState<PropertyFilterProps.Query>(defaultQuery);
  const [pendingEC2Action, setPendingEC2Action] = useState<{
    action: EC2LifecycleAction;
    instance: AwsEc2Instance;
  }>();
  const debouncedEC2Query = useDebouncedValue(ec2Query);
  const deferredEC2Query = useDeferredValue(debouncedEC2Query);
  const ec2ResultsArePending = ec2Query !== debouncedEC2Query;

  const chooseUploadFile = async () => {
    const selectedPath = await open({
      multiple: false,
      directory: false,
    });
    if (typeof selectedPath !== "string") {
      return;
    }
    setUploadSourcePath(selectedPath);
    setUploadObjectKey(defaultUploadKey(selectedPath, workspace.s3PrefixFilter));
    setUploadAcknowledged(false);
  };

  useEffect(() => {
    if (!uploadObjectKey && uploadSourcePath) {
      setUploadObjectKey(defaultUploadKey(uploadSourcePath, workspace.s3PrefixFilter));
    }
  }, [uploadObjectKey, uploadSourcePath, workspace.s3PrefixFilter]);

  useEffect(() => {
    const nextObjectKey = workspace.selectedS3ObjectKey || "";
    if (nextObjectKey !== lastSelectedS3ObjectRef.current) {
      lastSelectedS3ObjectRef.current = nextObjectKey;
      setS3ObjectDrawerOpen(Boolean(nextObjectKey));
    }
  }, [workspace.selectedS3ObjectKey]);

  useEffect(() => {
    const nextBucket = workspace.selectedS3BucketName || "";
    if (nextBucket !== lastSelectedS3BucketRef.current) {
      const nextPrefix = workspace.s3PrefixFilter || "";
      lastSelectedS3BucketRef.current = nextBucket;
      setS3PrefixDraft(nextPrefix);
      lastRequestedS3PrefixRef.current = nextPrefix;
    }
  }, [workspace.s3PrefixFilter, workspace.selectedS3BucketName]);

  useEffect(() => {
    if (debouncedS3PrefixDraft !== lastRequestedS3PrefixRef.current) {
      lastRequestedS3PrefixRef.current = debouncedS3PrefixDraft;
      onSetS3PrefixFilter(debouncedS3PrefixDraft);
    }
  }, [debouncedS3PrefixDraft, onSetS3PrefixFilter]);

  const workspaceSummaryPanel = (
    <Container
      header={
        <Header
          variant="h2"
          description="Locked context and the resource inventory currently available in this session."
        >
          Workspace Summary
        </Header>
      }
    >
      <div className="workspace-summary-grid">
        <div className="workspace-context-card">
          <div>
            <Box variant="awsui-key-label">Provider</Box>
            <strong>{workspace.provider?.label || "Unavailable"}</strong>
            {workspace.provider ? (
              <StatusIndicator type={statusType(workspace.provider)}>
                {workspace.provider.state}
              </StatusIndicator>
            ) : null}
          </div>
          <div>
            <Box variant="awsui-key-label">Profile</Box>
            <strong>{workspace.profile?.displayName || "Unavailable"}</strong>
            <span>{workspace.profile?.profileId || "No locked profile selected."}</span>
          </div>
          <div>
            <Box variant="awsui-key-label">Auth path</Box>
            <strong>{workspace.authMethod?.toUpperCase() || "Unavailable"}</strong>
            <span>Used by Overview, S3, EC2, and Actions.</span>
          </div>
        </div>
        <div className="workspace-metric-grid">
          {renderMetricCard(
            "S3 buckets",
            countLabel(workspace.s3Buckets.length, "bucket", "buckets"),
            workspace.selectedS3BucketName || "No bucket selected",
          )}
          {renderMetricCard(
            "S3 objects",
            countLabel(workspace.s3Objects.length, "object", "objects"),
            workspace.s3PrefixFilter ? `Prefix: ${workspace.s3PrefixFilter}` : "No prefix filter",
          )}
          {renderMetricCard(
            "EC2 instances",
            countLabel(workspace.ec2Instances.length, "instance", "instances"),
            workspace.selectedEc2Region || "No region selected",
          )}
          {renderMetricCard(
            "Write mode",
            workspace.awsWritesEnabled ? "Local endpoint" : "Read-only",
            workspace.awsEndpointUrl || "Default AWS endpoint",
          )}
        </div>
      </div>
    </Container>
  );

  const workspaceProfileDetails = renderProfileDetailPanel(
    workspace.profile,
    "Workspace Profile",
    "No locked workspace profile is available yet.",
    "The locked workspace snapshot will populate this profile detail.",
    showSensitiveValues,
    onToggleSensitiveValues,
  );

  const workspaceRuntimeSettingsPanel = renderRuntimeSettingsPanel(
    workspace.runtimeSettings,
    "Runtime settings embedded in the backend workspace snapshot.",
  );
  const environmentDiagnosticsPanel = (
    <Container
      header={
        <Header
          variant="h2"
          description="Backend path, CLI, and write-policy checks for the locked workspace."
        >
          Environment Diagnostics
        </Header>
      }
    >
      {renderDetailFields(
        workspace.environmentDiagnostics,
        "No environment diagnostics are available yet.",
        showSensitiveValues,
      )}
    </Container>
  );

  const overviewTab = (
    <SpaceBetween
      size="l"
      className="page-stack"
    >
      {workspaceSummaryPanel}
      <div className="setup-grid">
        {workspaceProfileDetails}
        {workspaceRuntimeSettingsPanel}
      </div>
      {environmentDiagnosticsPanel}
    </SpaceBetween>
  );

  const selectedObject = workspace.s3Objects.find(
    (object) => object.key === workspace.selectedS3ObjectKey,
  );
  const selectedObjectMetadataJson = JSON.stringify(
    {
      bucket: workspace.selectedS3BucketName,
      key: workspace.selectedS3ObjectKey,
      fields: detailFieldsAsObject(workspace.s3ObjectMetadata, showSensitiveValues),
    },
    null,
    2,
  );
  const selectedObjectMetadataCsv = [
    "label,value",
    ...workspace.s3ObjectMetadata.map((field) => {
      const value = field.sensitive && !showSensitiveValues ? "Hidden" : field.value;
      return `"${field.label.replaceAll("\"", "\"\"")}","${value.replaceAll("\"", "\"\"")}"`;
    }),
  ].join("\n");
  const effectiveS3PageId =
    activeS3PageId === "upload" || activeS3PageId === "url-tester"
      ? activeS3PageId
      : "objects";
  const s3BucketOptions = workspace.s3Buckets.map((bucket) => ({
    label: bucket.name,
    value: bucket.name,
  }));
  const selectedBucketOption = workspace.selectedS3BucketName
    ? {
        label: workspace.selectedS3BucketName,
        value: workspace.selectedS3BucketName,
      }
    : null;

  const s3ObjectColumns: TableProps.ColumnDefinition<AwsS3Object>[] = [
    {
      id: "key",
      header: "Object Key",
      cell: (object) => object.key,
    },
    {
      id: "size",
      header: "Size",
      cell: (object) => object.size || "Unknown",
    },
    {
      id: "modifiedAt",
      header: "Modified",
      cell: (object) => object.modifiedAt || "Unknown",
    },
    {
      id: "storageClass",
      header: "Storage Class",
      cell: (object) => object.storageClass || "STANDARD",
    },
  ];

  const s3ObjectDetailsDrawer = selectedObject && s3ObjectDrawerOpen ? (
    <aside
      className="s3-object-drawer"
      aria-label="S3 object details"
    >
      <div className="s3-object-drawer-header">
        <div>
          <Box variant="awsui-key-label">Selected object</Box>
          <h2>Object Detail</h2>
        </div>
        <Button
          iconName="close"
          variant="icon"
          ariaLabel="Close object detail"
          onClick={() => {
            setS3ObjectDrawerOpen(false);
          }}
        />
      </div>
      <SpaceBetween size="m">
        <div className="detail-card">
          <Box variant="awsui-key-label">Object key</Box>
          <Box variant="p">{workspace.selectedS3ObjectKey}</Box>
        </div>
        <div className="object-workbench-section">
          <Box variant="awsui-key-label">Metadata</Box>
          {renderDetailFields(
            workspace.s3ObjectMetadata,
            "No metadata loaded for the selected object.",
            showSensitiveValues,
          )}
          {workspace.s3ObjectMetadata.length > 0 ? (
            <SpaceBetween
              direction="horizontal"
              size="xs"
            >
              <Button
                variant="link"
                onClick={() => {
                  copyToClipboard(selectedObjectMetadataJson);
                }}
              >
                Copy Metadata JSON
              </Button>
              <Button
                variant="link"
                onClick={() => {
                  copyToClipboard(selectedObjectMetadataCsv);
                }}
              >
                Copy Metadata CSV
              </Button>
            </SpaceBetween>
          ) : null}
        </div>
        <div className="object-workbench-section">
          <Box variant="awsui-key-label">Copy snippets</Box>
          {workspace.s3ExportSnippets.length === 0 ? (
            <Box color="text-status-inactive">No copy snippets are available for this object.</Box>
          ) : (
            <SpaceBetween size="s">
              {workspace.s3ExportSnippets.map((snippet) => (
                <div
                  key={snippet.label}
                  className="snippet-card"
                >
                  <div className="snippet-header">
                    <Box variant="awsui-key-label">{snippet.label}</Box>
                    <Button
                      variant="link"
                      onClick={() => {
                        copyToClipboard(snippet.value);
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                  <pre>{snippet.value}</pre>
                </div>
              ))}
            </SpaceBetween>
          )}
        </div>
        <div className="object-workbench-section">
          <Box variant="awsui-key-label">Signed URL</Box>
          <SpaceBetween size="s">
            <Input
              value={signedUrlDurationSeconds}
              placeholder="Duration in seconds"
              onChange={({ detail }) => {
                setSignedUrlDurationSeconds(detail.value.replace(/\D/g, ""));
              }}
            />
            <Button
              disabled={!workspace.selectedS3ObjectKey}
              onClick={() => {
                onPresignS3Object(Number(signedUrlDurationSeconds || "3600"));
              }}
            >
              Generate Signed URL
            </Button>
            <Box color="text-body-secondary">{s3SignedUrlStatus}</Box>
            {s3SignedUrlResult ? (
              <div className="snippet-card">
                <div className="snippet-header">
                  <Box variant="awsui-key-label">
                    Expires {s3SignedUrlResult.expiresAt}
                  </Box>
                  <Button
                    variant="link"
                    onClick={() => {
                      copyToClipboard(s3SignedUrlResult.url);
                    }}
                  >
                    Copy URL
                  </Button>
                </div>
                <pre>{s3SignedUrlResult.url}</pre>
                {s3SignedUrlResult.effectiveWarning ? (
                  <Box color="text-body-secondary">
                    {s3SignedUrlResult.effectiveWarning}
                  </Box>
                ) : null}
              </div>
            ) : null}
          </SpaceBetween>
        </div>
      </SpaceBetween>
    </aside>
  ) : null;

  const s3ObjectBrowser = (
    <div className="s3-objects-layout">
      <Container
        className="s3-object-panel"
        header={
          <Header
            variant="h2"
            counter={`(${workspace.s3Objects.length})`}
            description={workspace.selectedS3BucketName || "Select a bucket to inspect its objects."}
          >
            Objects
          </Header>
        }
      >
        <SpaceBetween size="m">
          <Input
            value={s3PrefixDraft}
            placeholder="Filter by prefix, for example reports/"
            onChange={({ detail }) => {
              setS3PrefixDraft(detail.value);
            }}
          />
          {s3PrefixDraft !== (workspace.s3PrefixFilter || "") ? (
            <Box color="text-body-secondary">Updating object listing after typing pauses.</Box>
          ) : null}
          <Table
            items={workspace.s3Objects}
            columnDefinitions={s3ObjectColumns}
            selectionType="single"
            selectedItems={selectedObject ? [selectedObject] : []}
            trackBy="key"
            variant="embedded"
            onSelectionChange={({ detail }) => {
              const object = detail.selectedItems[0];
              if (object) {
                onSelectS3Object(object.key);
                setS3ObjectDrawerOpen(true);
              }
            }}
            empty={<Box color="text-status-inactive">No S3 objects loaded for the selected bucket.</Box>}
          />
        </SpaceBetween>
      </Container>
      {s3ObjectDetailsDrawer}
    </div>
  );

  const urlTesterPanel = (
    <Container
      header={
        <Header
          variant="h2"
          description="Inspect a pasted S3 signed URL or public object URL, then optionally make a range request."
        >
          URL Tester
        </Header>
      }
    >
      <SpaceBetween size="m">
        {s3SignedUrlResult ? (
          <div className="snippet-card">
            <div className="snippet-header">
              <Box variant="awsui-key-label">
                Latest signed URL for {s3SignedUrlResult.objectKey}
              </Box>
              <Button
                variant="link"
                onClick={() => {
                  setUrlTesterValue(s3SignedUrlResult.url);
                }}
              >
                Use latest signed URL
              </Button>
            </div>
            <pre>{s3SignedUrlResult.url}</pre>
          </div>
        ) : null}
        <Textarea
          value={urlTesterValue}
          placeholder="Paste an S3 signed URL or public object URL."
          onChange={({ detail }) => {
            setUrlTesterValue(detail.value);
          }}
        />
        <SpaceBetween
          direction="horizontal"
          size="xs"
        >
          <Button
            disabled={!urlTesterValue}
            onClick={() => {
              onAnalyseS3Url(urlTesterValue);
            }}
          >
            Analyse
          </Button>
          <Button
            disabled={!urlTesterValue}
            onClick={() => {
              onValidateS3Url(urlTesterValue);
            }}
          >
            Validate
          </Button>
        </SpaceBetween>
        {s3UrlInspection ? (
          <SpaceBetween size="s">
            <Box variant="p">{s3UrlInspection.summary}</Box>
            {renderDetailFields(s3UrlInspection.detailFields, "No URL details available.")}
          </SpaceBetween>
        ) : null}
        {s3UrlValidation ? (
          <SpaceBetween size="s">
            <StatusIndicator type={s3UrlValidation.succeeded ? "success" : "error"}>
              {s3UrlValidation.summary}
            </StatusIndicator>
            {renderDetailFields(s3UrlValidation.detailFields, "No validation details available.")}
          </SpaceBetween>
        ) : null}
      </SpaceBetween>
    </Container>
  );

  const s3WorkspaceStatusPanel = effectiveS3PageId === "url-tester" ? (
    <Container
      header={
        <Header
          variant="h2"
          description="URL tools work on pasted S3 links directly and do not require the current bucket selection."
        >
          S3 URL Context
        </Header>
      }
    >
      <div className="status-strip">
        <div className="status-pill">
          <Box variant="awsui-key-label">URL Scope</Box>
          <Box variant="p">Any pasted S3 URL</Box>
        </div>
        <div className="status-pill">
          <Box variant="awsui-key-label">Latest Signed URL</Box>
          <Box variant="p">{s3SignedUrlResult?.objectKey || "No signed URL generated in this session"}</Box>
        </div>
        <div className="status-pill">
          <Box variant="awsui-key-label">Selected Bucket</Box>
          <Box variant="p">{workspace.selectedS3BucketName || "Not required for URL tools"}</Box>
        </div>
      </div>
      <Box color="text-body-secondary">
        Paste a signed or public S3 URL to analyse or validate it. Bucket selection only affects object browsing and upload workflows.
      </Box>
    </Container>
  ) : (
    <Container
      header={
        <Header
          variant="h2"
          description={
            effectiveS3PageId === "objects"
              ? "Browse objects and select one to open details and share actions."
              : "Upload a local file into the selected bucket and prefix."
          }
        >
          {effectiveS3PageId === "objects" ? "S3 Objects" : "S3 Upload"}
        </Header>
      }
    >
      <div className="status-strip">
        <div className="status-pill">
          <Box variant="awsui-key-label">Bucket</Box>
          <Select
            selectedOption={selectedBucketOption}
            options={s3BucketOptions}
            placeholder="Select bucket"
            onChange={({ detail }) => {
              if (detail.selectedOption.value) {
                onSelectS3Bucket(detail.selectedOption.value);
              }
            }}
          />
        </div>
        <div className="status-pill">
          <Box variant="awsui-key-label">Prefix Filter</Box>
          <Box variant="p">{workspace.s3PrefixFilter || "No prefix filter"}</Box>
        </div>
        <div className="status-pill">
          <Box variant="awsui-key-label">Objects</Box>
          <Box variant="p">{countLabel(workspace.s3Objects.length, "object", "objects")}</Box>
        </div>
        <div className="status-pill">
          <Box variant="awsui-key-label">Selected Object</Box>
          <Box variant="p">{workspace.selectedS3ObjectKey || "No object selected"}</Box>
        </div>
      </div>
      <Box color="text-body-secondary">
        {workspace.s3StatusMessage || "S3 inventory is waiting for a locked AWS workspace."}
      </Box>
    </Container>
  );

  const s3Tab = (
    <SpaceBetween
      size="l"
      className="page-stack"
    >
      {s3WorkspaceStatusPanel}

      {effectiveS3PageId === "objects" ? s3ObjectBrowser : null}
      {effectiveS3PageId === "upload" ? (
        <Container
          header={
            <Header
              variant="h2"
              description="Upload uses the Go daemon and AWS SDK transfer manager."
            >
              Upload Object
            </Header>
          }
        >
          <SpaceBetween size="l">
            <div className="s3-form-grid">
              <div>
                <Box variant="awsui-key-label">Target bucket</Box>
                <Box variant="p">{workspace.selectedS3BucketName || "Select a bucket above"}</Box>
              </div>
              <div>
                <Box variant="awsui-key-label">Current prefix</Box>
                <Box variant="p">{workspace.s3PrefixFilter || "Bucket root"}</Box>
              </div>
              <div>
                <Box variant="awsui-key-label">Write policy</Box>
                <StatusIndicator type={workspace.awsWritesEnabled ? "success" : "warning"}>
                  {workspace.awsWritesEnabled ? "Local endpoint write enabled" : "Read-only"}
                </StatusIndicator>
              </div>
              <div>
                <Box variant="awsui-key-label">Endpoint</Box>
                <Box variant="p">{workspace.awsEndpointUrl || "Default AWS endpoint"}</Box>
              </div>
            </div>
            <div className="s3-upload-file-row">
              <Input
                value={uploadSourcePath}
                placeholder="Local file path, for example D:\\Downloads\\report.csv"
                onChange={({ detail }) => {
                  setUploadSourcePath(detail.value);
                  setUploadAcknowledged(false);
                  if (!uploadObjectKey) {
                    setUploadObjectKey(defaultUploadKey(detail.value, workspace.s3PrefixFilter));
                  }
                }}
              />
              <Button
                iconName="folder"
                onClick={() => {
                  void chooseUploadFile();
                }}
              >
                Browse...
              </Button>
            </div>
            <Input
              value={uploadObjectKey}
              placeholder="Destination object key"
              onChange={({ detail }) => {
                setUploadObjectKey(detail.value);
                setUploadAcknowledged(false);
              }}
            />
            <div className="s3-upload-safety">
              <Checkbox
                checked={uploadAcknowledged}
                disabled={!workspace.awsWritesEnabled || !workspace.selectedS3BucketName || !uploadSourcePath || !uploadObjectKey}
                onChange={({ detail }) => {
                  setUploadAcknowledged(detail.checked);
                }}
              >
                I have checked the selected bucket, destination key, local endpoint, and source file.
              </Checkbox>
              <Box color="text-body-secondary">
                Uploads are accepted only when the backend sees a local endpoint profile with explicit write opt-in. The daemon rejects directories, hidden absolute object keys, control characters, dot path segments, and files above 512 MiB.
              </Box>
            </div>
            <Button
              disabled={!workspace.awsWritesEnabled || !workspace.selectedS3BucketName || !uploadSourcePath || !uploadObjectKey || !uploadAcknowledged}
              onClick={() => {
                onUploadS3Object(uploadSourcePath, uploadObjectKey);
                setUploadAcknowledged(false);
              }}
            >
              Upload
            </Button>
            <Box color="text-body-secondary">{s3UploadStatus}</Box>
          </SpaceBetween>
        </Container>
      ) : null}
      {effectiveS3PageId === "url-tester" ? urlTesterPanel : null}
    </SpaceBetween>
  );

  const ec2Fields: CollectionField<AwsEc2Instance>[] = useMemo(
    () => [
      {
        key: "instanceId",
        label: "Instance ID",
        getValue: (instance) => instance.instanceId,
      },
      {
        key: "name",
        label: "Name",
        getValue: (instance) => instance.name,
      },
      {
        key: "state",
        label: "State",
        getValue: (instance) => instance.state,
      },
      {
        key: "type",
        label: "Type",
        getValue: (instance) => instance.instanceType,
      },
      {
        key: "zone",
        label: "Availability Zone",
        getValue: (instance) => instance.availabilityZone,
      },
      {
        key: "ip",
        label: "IP Address",
        getValue: (instance) =>
          [instance.publicIp, instance.privateIp].filter(
            (value): value is string => Boolean(value),
          ),
      },
      {
        key: "vpc",
        label: "VPC",
        getValue: (instance) => instance.vpcId,
      },
      {
        key: "subnet",
        label: "Subnet",
        getValue: (instance) => instance.subnetId,
      },
      {
        key: "securityGroup",
        label: "Security Group",
        getValue: (instance) => instance.securityGroups,
      },
      {
        key: "tag",
        label: "Tag",
        getValue: (instance) => instance.tags?.map((tag) => `${tag.label}:${tag.value}`),
      },
    ],
    [],
  );
  const filteredEC2Instances = useMemo(
    () => filterCollection(workspace.ec2Instances, deferredEC2Query, ec2Fields),
    [deferredEC2Query, ec2Fields, workspace.ec2Instances],
  );
  const selectedEC2Instance =
    workspace.ec2Instances.find(
      (instance) => instance.instanceId === workspace.selectedEc2InstanceId,
    ) ?? workspace.ec2Instances[0];
  const selectedEC2TableItem = filteredEC2Instances.find(
    (instance) => instance.instanceId === selectedEC2Instance?.instanceId,
  );
  const selectedEC2RegionOption = workspace.selectedEc2Region
    ? {
        label: workspace.selectedEc2Region,
        value: workspace.selectedEc2Region,
      }
    : null;
  const ec2RegionOptions = workspace.ec2Regions.map((region) => ({
    label: region,
    value: region,
  }));
  const ec2InstanceColumns: TableProps.ColumnDefinition<AwsEc2Instance>[] = [
    {
      id: "name",
      header: "Name",
      cell: (instance) => instance.name || "Unnamed",
    },
    {
      id: "instanceId",
      header: "Instance ID",
      cell: (instance) => instance.instanceId,
    },
    {
      id: "state",
      header: "State",
      cell: (instance) => (
        <StatusIndicator type={instanceStateType(instance.state)}>
          {instance.state || "Unknown"}
        </StatusIndicator>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: (instance) => instance.instanceType || "Unknown",
    },
    {
      id: "zone",
      header: "Zone",
      cell: (instance) => instance.availabilityZone || "Unknown",
    },
    {
      id: "vpc",
      header: "VPC",
      cell: (instance) => instance.vpcId || "Unavailable",
    },
    {
      id: "subnet",
      header: "Subnet",
      cell: (instance) => instance.subnetId || "Unavailable",
    },
    {
      id: "privateIp",
      header: "Private IP",
      cell: (instance) => instance.privateIp || "Unavailable",
    },
    {
      id: "publicIp",
      header: "Public IP",
      cell: (instance) => instance.publicIp || "Unavailable",
    },
  ];
  const ec2FilteringProperties: PropertyFilterProps.FilteringProperty[] = useMemo(
    () =>
      ec2Fields.map((field) => ({
        key: field.key,
        propertyLabel: field.label,
        groupValuesLabel: `${field.label} values`,
        operators: [":", "!:", "=", "!="],
      })),
    [ec2Fields],
  );
  const ec2FilteringOptions = useMemo(
    () => makeFilteringOptions(workspace.ec2Instances, ec2Fields),
    [ec2Fields, workspace.ec2Instances],
  );
  const ec2CopySnippets = selectedEC2Instance
    ? [
        {
          label: "Instance ID",
          value: selectedEC2Instance.instanceId,
        },
        {
          label: "AWS CLI describe command",
          value: `aws ec2 describe-instances --instance-ids ${selectedEC2Instance.instanceId}${
            workspace.selectedEc2Region ? ` --region ${workspace.selectedEc2Region}` : ""
          }`,
        },
        {
          label: "AWS Console URL",
          value: ec2ConsoleUrl(workspace.selectedEc2Region, selectedEC2Instance.instanceId),
        },
        {
          label: "Private connection hint",
          value: selectedEC2Instance.privateIp
            ? `ssh ec2-user@${selectedEC2Instance.privateIp}`
            : "No private IP address is available for this instance.",
        },
        {
          label: "Instance detail JSON",
          value: JSON.stringify(
            {
              region: workspace.selectedEc2Region,
              instance: selectedEC2Instance,
            },
            null,
            2,
          ),
        },
        {
          label: "Instance CSV row",
          value: [
            "region,instanceId,name,state,instanceType,privateIp,publicIp,vpcId,subnetId",
            [
              workspace.selectedEc2Region || "",
              selectedEC2Instance.instanceId,
              selectedEC2Instance.name || "",
              selectedEC2Instance.state || "",
              selectedEC2Instance.instanceType || "",
              selectedEC2Instance.privateIp || "",
              selectedEC2Instance.publicIp || "",
              selectedEC2Instance.vpcId || "",
              selectedEC2Instance.subnetId || "",
            ].map((value) => `"${value.replaceAll("\"", "\"\"")}"`).join(","),
          ].join("\n"),
        },
      ]
    : [];
  const selectedEC2State = selectedEC2Instance?.state?.toLowerCase();
  const ec2CanWrite = Boolean(selectedEC2Instance) && workspace.awsWritesEnabled && !ec2ActionInFlight;
  const ec2CanStart = ec2CanWrite && selectedEC2State === "stopped";
  const ec2CanStop = ec2CanWrite && selectedEC2State === "running";
  const ec2CanReboot = ec2CanWrite && selectedEC2State === "running";
  const pendingEC2ActionLabel = pendingEC2Action
    ? pendingEC2Action.action[0].toUpperCase() + pendingEC2Action.action.slice(1)
    : "";
  const ec2ConfirmationPanel = pendingEC2Action ? (
    <Container className="ec2-confirmation-panel">
      <div
        role="dialog"
        aria-label={`${pendingEC2ActionLabel} EC2 instance`}
      >
        <SpaceBetween size="s">
          <Header
            variant="h3"
            actions={
              <SpaceBetween
                direction="horizontal"
                size="xs"
              >
                <Button
                  variant="link"
                  onClick={() => {
                    setPendingEC2Action(undefined);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    onInvokeEC2Action(pendingEC2Action.action, pendingEC2Action.instance.instanceId);
                    setPendingEC2Action(undefined);
                  }}
                >
                  Confirm {pendingEC2ActionLabel}
                </Button>
              </SpaceBetween>
            }
          >
            {pendingEC2ActionLabel} EC2 instance
          </Header>
          <Box>
            This will send a live EC2 {pendingEC2Action.action} request to the selected profile endpoint.
          </Box>
          <div className="detail-grid">
            <div className="detail-card">
              <Box variant="awsui-key-label">Instance</Box>
              <Box variant="p">{pendingEC2Action.instance.instanceId}</Box>
            </div>
            <div className="detail-card">
              <Box variant="awsui-key-label">Current State</Box>
              <Box variant="p">{pendingEC2Action.instance.state || "Unknown"}</Box>
            </div>
            <div className="detail-card">
              <Box variant="awsui-key-label">Region</Box>
              <Box variant="p">{workspace.selectedEc2Region || "Unknown"}</Box>
            </div>
            <div className="detail-card">
              <Box variant="awsui-key-label">Endpoint</Box>
              <Box variant="p">{workspace.awsEndpointUrl || "Default AWS endpoint"}</Box>
            </div>
          </div>
        </SpaceBetween>
      </div>
    </Container>
  ) : null;

  const ec2Tab = (
    <SpaceBetween
      size="l"
      className="page-stack"
    >
      {ec2ConfirmationPanel}
      {ec2ActionInFlight ? (
        <Container className="ec2-progress-panel">
          <SpaceBetween
            direction="horizontal"
            size="s"
            alignItems="center"
          >
            <StatusIndicator type="loading">EC2 operation running</StatusIndicator>
            <Box>{ec2ActionStatus}</Box>
          </SpaceBetween>
        </Container>
      ) : null}
      <Container
        header={
          <Header
            variant="h2"
            description="Region-scoped instance inventory with local-endpoint write protection."
          >
            EC2 Fleet
          </Header>
        }
      >
        <div className="status-strip">
          <div className="status-pill">
            <Box variant="awsui-key-label">Selected Region</Box>
            <Box variant="p">{workspace.selectedEc2Region || "No region selected"}</Box>
          </div>
          <div className="status-pill">
            <Box variant="awsui-key-label">Selected Instance</Box>
            <Box variant="p">{selectedEC2Instance?.instanceId || "No instance selected"}</Box>
          </div>
          <div className="status-pill">
            <Box variant="awsui-key-label">Instances</Box>
            <Box variant="p">{countLabel(workspace.ec2Instances.length, "instance", "instances")}</Box>
          </div>
          <div className="status-pill">
            <Box variant="awsui-key-label">Write Mode</Box>
            <Box variant="p">{workspace.awsWritesEnabled ? "Local endpoint enabled" : "Read-only"}</Box>
          </div>
        </div>
        <Box color="text-body-secondary">
          {workspace.ec2StatusMessage || "EC2 inventory is waiting for a locked AWS workspace."}
          {workspace.awsEndpointUrl ? ` Endpoint: ${workspace.awsEndpointUrl}.` : ""}
        </Box>
      </Container>

      <Container
        header={
          <Header
            variant="h2"
            description="Select a region, filter instances, then choose one instance for details and actions."
            actions={
              <SpaceBetween
                direction="horizontal"
                size="xs"
              >
                <Button
                  iconName="refresh"
                  disabled={!workspace.selectedEc2Region || ec2ActionInFlight}
                  onClick={onRefreshEC2Instances}
                >
                  Refresh EC2
                </Button>
                <Select
                  selectedOption={selectedEC2RegionOption}
                  options={ec2RegionOptions}
                  placeholder="Select region"
                  empty="No EC2 regions available"
                  selectedAriaLabel="Selected"
                  onChange={({ detail }) => {
                    const region = detail.selectedOption.value;
                    if (region) {
                      onSelectEC2Region(region);
                    }
                  }}
                />
              </SpaceBetween>
            }
          >
            Instances
          </Header>
        }
      >
        <Table
          items={filteredEC2Instances}
          columnDefinitions={ec2InstanceColumns}
          selectionType="single"
          selectedItems={selectedEC2TableItem ? [selectedEC2TableItem] : []}
          trackBy="instanceId"
          variant="embedded"
          filter={
            <PropertyFilter
              query={ec2Query}
              filteringProperties={ec2FilteringProperties}
              filteringOptions={ec2FilteringOptions}
              i18nStrings={propertyFilterStrings}
              onChange={({ detail }) => {
                setEC2Query(detail);
              }}
              countText={
                ec2ResultsArePending
                  ? "Updating matches"
                  : countLabel(filteredEC2Instances.length, "match", "matches")
              }
              expandToViewport
            />
          }
          onSelectionChange={({ detail }) => {
            const instance = detail.selectedItems[0];
            if (instance) {
              onSelectEC2Instance(instance.instanceId);
            }
          }}
          empty={<Box color="text-status-inactive">No EC2 instances loaded for this region.</Box>}
          header={
            <Header
              counter={`(${filteredEC2Instances.length}/${workspace.ec2Instances.length})`}
              actions={
                <SpaceBetween
                  direction="horizontal"
                  size="xs"
                >
                  <Button
                    disabled={!ec2CanStart}
                    onClick={() => {
                      if (selectedEC2Instance) {
                        setPendingEC2Action({ action: "start", instance: selectedEC2Instance });
                      }
                    }}
                  >
                    Start
                  </Button>
                  <Button
                    disabled={!ec2CanStop}
                    onClick={() => {
                      if (selectedEC2Instance) {
                        setPendingEC2Action({ action: "stop", instance: selectedEC2Instance });
                      }
                    }}
                  >
                    Stop
                  </Button>
                  <Button
                    disabled={!ec2CanReboot}
                    onClick={() => {
                      if (selectedEC2Instance) {
                        setPendingEC2Action({ action: "reboot", instance: selectedEC2Instance });
                      }
                    }}
                  >
                    Reboot
                  </Button>
                </SpaceBetween>
              }
            >
              Instance Inventory
            </Header>
          }
        />
        <Box color={ec2ActionInFlight ? "text-status-info" : "text-body-secondary"}>
          {ec2ActionStatus}
        </Box>
      </Container>

      <div className="setup-grid">
        <Container
          header={
            <Header
              variant="h2"
              description={selectedEC2Instance?.instanceId || "Select an instance for details."}
            >
              Instance Detail
            </Header>
          }
        >
          {selectedEC2Instance
            ? renderDetailFields(
                [
                  { label: "Name", value: selectedEC2Instance.name || "Unnamed" },
                  { label: "State", value: selectedEC2Instance.state || "Unknown" },
                  { label: "Instance Type", value: selectedEC2Instance.instanceType || "Unknown" },
                  { label: "Availability Zone", value: selectedEC2Instance.availabilityZone || "Unknown" },
                  { label: "VPC", value: selectedEC2Instance.vpcId || "Unavailable" },
                  { label: "Subnet", value: selectedEC2Instance.subnetId || "Unavailable" },
                  { label: "Security Groups", value: joinedValues(selectedEC2Instance.securityGroups) },
                  { label: "Key Pair", value: selectedEC2Instance.keyName || "Unavailable" },
                  { label: "Platform", value: selectedEC2Instance.platformDetails || "Unavailable" },
                  { label: "Architecture", value: selectedEC2Instance.architecture || "Unavailable" },
                  { label: "Launch Time", value: selectedEC2Instance.launchTime || "Unavailable" },
                  { label: "Private IP", value: selectedEC2Instance.privateIp || "Unavailable" },
                  { label: "Public IP", value: selectedEC2Instance.publicIp || "Unavailable" },
                  { label: "Tags", value: ec2TagValues(selectedEC2Instance.tags) },
                ],
                "No instance details are available.",
              )
            : <Box color="text-status-inactive">No EC2 instance selected.</Box>}
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              description="Generated locally from the selected region and instance. No snippet is stored."
            >
              Copy Actions
            </Header>
          }
        >
          {ec2CopySnippets.length === 0 ? (
            <Box color="text-status-inactive">Select an instance to generate copy actions.</Box>
          ) : (
            <SpaceBetween size="s">
              {ec2CopySnippets.map((snippet) => (
                <div
                  key={snippet.label}
                  className="snippet-card"
                >
                  <div className="snippet-header">
                    <Box variant="awsui-key-label">{snippet.label}</Box>
                    <Button
                      variant="link"
                      onClick={() => {
                        copyToClipboard(snippet.value);
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                  <pre>{snippet.value}</pre>
                </div>
              ))}
            </SpaceBetween>
          )}
        </Container>
      </div>

      <Container
        header={
          <Header
            variant="h2"
            description="Recent lifecycle job messages for this workspace session."
          >
            EC2 Action History
          </Header>
        }
      >
        {ec2ActionHistory.length === 0 ? (
          <Box color="text-status-inactive">No EC2 lifecycle actions have run in this session.</Box>
        ) : (
          <SpaceBetween size="s">
            {ec2ActionHistory.map((item) => (
              <div
                key={item.jobId}
                className="detail-card"
              >
                <SpaceBetween
                  direction="horizontal"
                  size="s"
                  alignItems="center"
                >
                  <StatusIndicator type={jobStatusType(item.status)}>
                    {item.status}
                  </StatusIndicator>
                  <Box>{item.message}</Box>
                </SpaceBetween>
                {item.completedAt ? (
                  <Box color="text-body-secondary">{item.completedAt}</Box>
                ) : null}
              </div>
            ))}
          </SpaceBetween>
        )}
      </Container>
    </SpaceBetween>
  );

  const recentActivityPanel = (
    <Container
      header={
        <Header
          variant="h2"
          description="Backend log stream and recent job history for the current locked workspace."
          actions={
            <Button
              iconName="refresh"
              onClick={() => {
                onInvokeWorkspaceAction("refresh");
              }}
            >
              Refresh Discovery
            </Button>
          }
        >
          Activity
        </Header>
      }
    >
      <div className="log-stream">{renderLogEntries(logs.slice(0, 12))}</div>
    </Container>
  );

  const activeWorkspaceTab = session.workspaceTabs.find((tab) => tab.tabId === activeTabId);
  const lockedProviderId = session.lockedProviderId?.toLowerCase() ?? "";
  const azureSubscriptionId = profileFieldValue(workspace.profile, "Subscription ID") || workspace.profile?.profileId;
  const azureTenantId = profileFieldValue(workspace.profile, "Tenant ID") || "Unavailable";
  const azureUserName =
    profileFieldValue(workspace.profile, "User Name") ||
    profileFieldValue(workspace.profile, "User") ||
    "Unavailable";
  const azureAuthSummary =
    workspace.profile?.authMethods.find((method) => method.method === workspace.authMethod)?.summary ||
    "The locked Azure auth path is ready for read-only workspace views.";
  const effectiveAzurePageId =
    activeAzurePageId === "resource-groups" || activeAzurePageId === "virtual-machines"
      ? activeAzurePageId
      : "overview";
  const azureResourceGroupOptions = workspace.azureResourceGroups.map((group) => ({
    label: group.name,
    value: group.name,
  }));
  const selectedAzureResourceGroupOption = workspace.selectedAzureResourceGroup
    ? { label: workspace.selectedAzureResourceGroup, value: workspace.selectedAzureResourceGroup }
    : null;
  const selectedAzureVM =
    workspace.azureVirtualMachines.find((vm) => vm.vmId === workspace.selectedAzureVmId) ??
    workspace.azureVirtualMachines[0];
  const selectedAzureVMTableItem =
    workspace.azureVirtualMachines.find((vm) => vm.vmId === selectedAzureVM?.vmId) ?? undefined;
  const azureResourceGroupColumns: TableProps.ColumnDefinition<AzureResourceGroup>[] = [
    {
      id: "name",
      header: "Name",
      cell: (group) => group.name,
    },
    {
      id: "location",
      header: "Location",
      cell: (group) => group.location || "Unknown",
    },
    {
      id: "state",
      header: "Provisioning",
      cell: (group) => (
        <StatusIndicator type={azureStatusType(group.provisioningState)}>
          {group.provisioningState || "Unknown"}
        </StatusIndicator>
      ),
    },
    {
      id: "managedBy",
      header: "Managed By",
      cell: (group) => group.managedBy || "Direct subscription resource",
    },
  ];
  const azureVirtualMachineColumns: TableProps.ColumnDefinition<AzureVirtualMachine>[] = [
    {
      id: "name",
      header: "Name",
      cell: (vm) => vm.name,
    },
    {
      id: "state",
      header: "Power State",
      cell: (vm) => (
        <StatusIndicator type={azureStatusType(vm.powerState)}>
          {vm.powerState || "Unknown"}
        </StatusIndicator>
      ),
    },
    {
      id: "size",
      header: "Size",
      cell: (vm) => vm.size || "Unknown",
    },
    {
      id: "osType",
      header: "OS",
      cell: (vm) => vm.osType || "Unknown",
    },
    {
      id: "privateIp",
      header: "Private IP",
      cell: (vm) => vm.privateIp || "Unavailable",
    },
    {
      id: "publicIp",
      header: "Public IP",
      cell: (vm) => vm.publicIp || "Unavailable",
    },
  ];
  const azureOverviewTab = (
    <SpaceBetween
      size="l"
      className="page-stack"
    >
      <Container
        header={
          <Header
            variant="h2"
            description="Read-only Azure workspace context for the locked subscription."
          >
            Azure Workspace
          </Header>
        }
      >
        <div className="workspace-summary-grid">
          <div className="workspace-context-card">
            <div>
              <Box variant="awsui-key-label">Subscription</Box>
              <strong>{workspace.profile?.displayName || "Unavailable"}</strong>
              <span>{azureSubscriptionId || "No subscription ID available"}</span>
            </div>
            <div>
              <Box variant="awsui-key-label">Tenant</Box>
              <strong>{azureTenantId}</strong>
              <span>User: {azureUserName}</span>
            </div>
            <div>
              <Box variant="awsui-key-label">Auth path</Box>
              <strong>{workspace.authMethod?.toUpperCase() || "Unavailable"}</strong>
              <span>{azureAuthSummary}</span>
            </div>
          </div>
          <div className="workspace-metric-grid">
            {renderMetricCard(
              "Workspace mode",
              "Read-only",
              "Azure inventory starts with subscription context before resource explorers land.",
            )}
            {renderMetricCard(
              "CLI readiness",
              workspace.provider?.commandPath ? "Azure CLI detected" : "CLI not detected",
              workspace.provider?.commandPath || "Using local profile cache only",
            )}
            {renderMetricCard(
              "Profile source",
              countLabel(workspace.profile?.sourcePaths.length || 0, "path", "paths"),
              workspace.profile?.sourcePaths[0] || "No profile path recorded",
            )}
            {renderMetricCard(
              "Next slices",
              "Resource Groups, VMs",
              "Provider-aware inventory views are being added incrementally.",
            )}
          </div>
        </div>
      </Container>

      <div className="setup-grid">
        {workspaceProfileDetails}
        <Container
          header={
            <Header
              variant="h2"
              description="What this Azure foundation branch is establishing before resource-specific views are added."
            >
              Azure Roadmap
            </Header>
          }
        >
          <SpaceBetween size="m">
            <Box variant="p">
              The workspace shell is now provider-aware, so locked Azure sessions no longer expose AWS-only tabs such as S3 and EC2.
            </Box>
            <div className="detail-grid">
              <div className="detail-card">
                <Box variant="awsui-key-label">Now</Box>
                <Box variant="p">Subscription identity, tenant context, auth readiness, runtime diagnostics.</Box>
              </div>
              <div className="detail-card">
                <Box variant="awsui-key-label">Next</Box>
                <Box variant="p">Read-only Azure Resource Groups and Virtual Machines inventory.</Box>
              </div>
              <div className="detail-card">
                <Box variant="awsui-key-label">Later</Box>
                <Box variant="p">Provider-specific actions once safe write guards and inventory seams are in place.</Box>
              </div>
            </div>
          </SpaceBetween>
        </Container>
      </div>

      {environmentDiagnosticsPanel}
    </SpaceBetween>
  );

  const azureWorkspaceStatusPanel = (
    <Container
      header={
        <Header
          variant="h2"
          description="Read-only Azure inventory scoped to the locked subscription and selected resource group."
        >
          Azure Inventory
        </Header>
      }
    >
      <div className="status-strip">
        <div className="status-pill">
          <Box variant="awsui-key-label">Resource Groups</Box>
          <Box variant="p">{countLabel(workspace.azureResourceGroups.length, "group", "groups")}</Box>
        </div>
        <div className="status-pill">
          <Box variant="awsui-key-label">Selected Group</Box>
          <Box variant="p">{workspace.selectedAzureResourceGroup || "No resource group selected"}</Box>
        </div>
        <div className="status-pill">
          <Box variant="awsui-key-label">Virtual Machines</Box>
          <Box variant="p">{countLabel(workspace.azureVirtualMachines.length, "VM", "VMs")}</Box>
        </div>
        <div className="status-pill">
          <Box variant="awsui-key-label">Selected VM</Box>
          <Box variant="p">{selectedAzureVM?.name || "No VM selected"}</Box>
        </div>
      </div>
      <Box color="text-body-secondary">
        {workspace.azureStatusMessage || "Azure inventory is waiting for a locked Azure workspace."}
      </Box>
    </Container>
  );

  const azureResourceGroupsTab = (
    <SpaceBetween
      size="l"
      className="page-stack"
    >
      {azureWorkspaceStatusPanel}
      <Container
        header={
          <Header
            variant="h2"
            description="Browse resource groups discovered for the locked Azure subscription."
          >
            Azure Resource Groups
          </Header>
        }
      >
        <Table
          items={workspace.azureResourceGroups}
          columnDefinitions={azureResourceGroupColumns}
          selectionType="single"
          selectedItems={
            workspace.selectedAzureResourceGroup
              ? workspace.azureResourceGroups.filter((group) => group.name === workspace.selectedAzureResourceGroup)
              : []
          }
          trackBy="name"
          variant="embedded"
          onSelectionChange={({ detail }) => {
            const group = detail.selectedItems[0];
            if (group) {
              onSelectAzureResourceGroup(group.name);
            }
          }}
          empty={<Box color="text-status-inactive">No Azure resource groups were returned for this subscription.</Box>}
        />
      </Container>
      <Container
        header={
          <Header
            variant="h2"
            description={workspace.selectedAzureResourceGroup || "Select a resource group for detail."}
          >
            Resource Group Detail
          </Header>
        }
      >
        {workspace.selectedAzureResourceGroup
          ? renderDetailFields(
              [
                {
                  label: "Name",
                  value:
                    workspace.azureResourceGroups.find((group) => group.name === workspace.selectedAzureResourceGroup)?.name ||
                    workspace.selectedAzureResourceGroup,
                },
                {
                  label: "Location",
                  value:
                    workspace.azureResourceGroups.find((group) => group.name === workspace.selectedAzureResourceGroup)?.location ||
                    "Unknown",
                },
                {
                  label: "Provisioning State",
                  value:
                    workspace.azureResourceGroups.find((group) => group.name === workspace.selectedAzureResourceGroup)?.provisioningState ||
                    "Unknown",
                },
                {
                  label: "Managed By",
                  value:
                    workspace.azureResourceGroups.find((group) => group.name === workspace.selectedAzureResourceGroup)?.managedBy ||
                    "Direct subscription resource",
                },
                {
                  label: "Tags",
                  value: joinedValues(
                    workspace.azureResourceGroups
                      .find((group) => group.name === workspace.selectedAzureResourceGroup)
                      ?.tags?.map((tag) => `${tag.label}=${tag.value}`),
                    "No tags returned",
                  ),
                },
              ],
              "No resource group details are available.",
            )
          : <Box color="text-status-inactive">No Azure resource group selected.</Box>}
      </Container>
    </SpaceBetween>
  );

  const azureVirtualMachinesTab = (
    <SpaceBetween
      size="l"
      className="page-stack"
    >
      {azureWorkspaceStatusPanel}
      <Container
        header={
          <Header
            variant="h2"
            description="Select a resource group, then browse its Azure virtual machines."
            actions={
              <Select
                selectedOption={selectedAzureResourceGroupOption}
                options={azureResourceGroupOptions}
                placeholder="Select resource group"
                empty="No Azure resource groups available"
                selectedAriaLabel="Selected"
                onChange={({ detail }) => {
                  const resourceGroup = detail.selectedOption.value;
                  if (resourceGroup) {
                    onSelectAzureResourceGroup(resourceGroup);
                  }
                }}
              />
            }
          >
            Azure Virtual Machines
          </Header>
        }
      >
        <Table
          items={workspace.azureVirtualMachines}
          columnDefinitions={azureVirtualMachineColumns}
          selectionType="single"
          selectedItems={selectedAzureVMTableItem ? [selectedAzureVMTableItem] : []}
          trackBy="vmId"
          variant="embedded"
          onSelectionChange={({ detail }) => {
            const vm = detail.selectedItems[0];
            if (vm) {
              onSelectAzureVirtualMachine(vm.vmId);
            }
          }}
          empty={<Box color="text-status-inactive">No Azure virtual machines loaded for the selected resource group.</Box>}
        />
      </Container>
      <div className="setup-grid">
        <Container
          header={
            <Header
              variant="h2"
              description={selectedAzureVM?.vmId || "Select a virtual machine for detail."}
            >
              Virtual Machine Detail
            </Header>
          }
        >
          {selectedAzureVM
            ? renderDetailFields(
                [
                  { label: "Name", value: selectedAzureVM.name },
                  { label: "Resource Group", value: selectedAzureVM.resourceGroup || "Unknown" },
                  { label: "Power State", value: selectedAzureVM.powerState || "Unknown" },
                  { label: "Provisioning State", value: selectedAzureVM.provisioningState || "Unknown" },
                  { label: "Size", value: selectedAzureVM.size || "Unknown" },
                  { label: "OS Type", value: selectedAzureVM.osType || "Unknown" },
                  { label: "Location", value: selectedAzureVM.location || "Unknown" },
                  { label: "Private IP", value: selectedAzureVM.privateIp || "Unavailable" },
                  { label: "Public IP", value: selectedAzureVM.publicIp || "Unavailable" },
                  {
                    label: "Tags",
                    value: joinedValues(selectedAzureVM.tags?.map((tag) => `${tag.label}=${tag.value}`), "No tags returned"),
                  },
                ],
                "No virtual machine details are available.",
              )
            : <Box color="text-status-inactive">No Azure virtual machine selected.</Box>}
        </Container>
        <Container
          header={
            <Header
              variant="h2"
              description="Generated locally for the selected Azure VM. No data is persisted beyond the current snapshot."
            >
              Copy Actions
            </Header>
          }
        >
          {!selectedAzureVM ? (
            <Box color="text-status-inactive">Select a virtual machine to generate copy actions.</Box>
          ) : (
            <SpaceBetween size="s">
              {[
                {
                  label: "Azure CLI show command",
                  value: `az vm show --subscription ${workspace.profile?.profileId || "<subscription>"} --resource-group ${selectedAzureVM.resourceGroup || workspace.selectedAzureResourceGroup || "<resource-group>"} --name ${selectedAzureVM.name}`,
                },
                {
                  label: "Azure CLI start command",
                  value: `az vm start --subscription ${workspace.profile?.profileId || "<subscription>"} --resource-group ${selectedAzureVM.resourceGroup || workspace.selectedAzureResourceGroup || "<resource-group>"} --name ${selectedAzureVM.name}`,
                },
                {
                  label: "Virtual machine JSON",
                  value: JSON.stringify(selectedAzureVM, null, 2),
                },
              ].map((snippet) => (
                <div
                  key={snippet.label}
                  className="snippet-card"
                >
                  <div className="snippet-header">
                    <Box variant="awsui-key-label">{snippet.label}</Box>
                    <Button
                      variant="link"
                      onClick={() => {
                        copyToClipboard(snippet.value);
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                  <pre>{snippet.value}</pre>
                </div>
              ))}
            </SpaceBetween>
          )}
        </Container>
      </div>
    </SpaceBetween>
  );

  const providerPlaceholderTab = (
    <SpaceBetween
      size="l"
      className="page-stack"
    >
      <Container
        header={
          <Header
            variant="h2"
            description={activeWorkspaceTab?.summary}
          >
            {activeWorkspaceTab?.label ?? "Workspace"}
          </Header>
        }
      >
        <SpaceBetween size="m">
          <Box variant="p">{activeWorkspaceTab?.detail ?? "Select a workspace view."}</Box>
          <Box color="text-body-secondary">
            This provider-specific workspace surface is attached to the locked session and ready for the next inventory slice.
          </Box>
          {workspaceProfileDetails}
        </SpaceBetween>
      </Container>
      {environmentDiagnosticsPanel}
    </SpaceBetween>
  );

  const actionsTab = recentActivityPanel;

  const activeTabContent =
    activeTabId === "overview"
      ? overviewTab
      : activeTabId === "s3"
        ? s3Tab
      : activeTabId === "ec2"
          ? ec2Tab
          : activeTabId === "azure-overview"
            ? effectiveAzurePageId === "resource-groups"
              ? azureResourceGroupsTab
              : effectiveAzurePageId === "virtual-machines"
                ? azureVirtualMachinesTab
                : azureOverviewTab
          : activeTabId === "azure-resource-groups"
            ? azureResourceGroupsTab
          : activeTabId === "azure-vms"
            ? azureVirtualMachinesTab
          : activeTabId === "actions"
            ? actionsTab
            : providerPlaceholderTab;

  return (
    <SpaceBetween
      size="l"
      className="page-stack"
    >
      <Container
        header={
          <Header
            variant="h1"
            description={`${session.lockedProviderId?.toUpperCase()} / ${session.lockedProfileId} / ${session.lockedAuthMethod}`}
            actions={
              <SpaceBetween
                direction="horizontal"
                size="xs"
              >
                <Button onClick={onToggleSplitPanel}>
                  {splitPanelOpen ? "Hide Activity" : "Show Activity"}
                </Button>
                <Button
                  iconName="refresh"
                  onClick={onRefreshDiscovery}
                >
                  Refresh
                </Button>
                <Button onClick={onUnlockSession}>Unlock</Button>
              </SpaceBetween>
            }
          >
            Locked Workspace
          </Header>
        }
        >
          <Box color="text-body-secondary">
          {lockedProviderId === "azure"
            ? "Review the locked Azure subscription, confirm local auth context, and prepare for provider-specific inventory views."
            : lockedProviderId === "gcp"
              ? "Review the locked GCP configuration, confirm local auth context, and prepare for provider-specific inventory views."
              : "Review the locked profile, inspect resource inventory, and track live activity from a stable local session."}
          </Box>
          <div className="status-strip">
            <div className="status-pill">
              <Box variant="awsui-key-label">Latest Activity</Box>
              <Box variant="p">{latestLog?.message ?? "No activity recorded yet."}</Box>
            </div>
            <div className="status-pill">
              <Box variant="awsui-key-label">Provider Context</Box>
              <Box variant="p">
                {workspace.provider?.label || session.lockedProviderId || "Unavailable"}
                {" / "}
                {workspace.profile?.displayName || session.lockedProfileId || "Unavailable"}
              </Box>
            </div>
            <div className="status-pill">
              <Box variant="awsui-key-label">Available Views</Box>
              <Box variant="p">{session.workspaceTabs.map((tab) => tab.label).join(", ")}</Box>
            </div>
          </div>
        </Container>

      <div role="tabpanel">{activeTabContent}</div>
    </SpaceBetween>
  );
}
