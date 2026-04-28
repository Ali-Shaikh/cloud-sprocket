import {
  Box,
  Button,
  Container,
  Header,
  Input,
  PropertyFilter,
  Select,
  SpaceBetween,
  StatusIndicator,
  Table,
  Tabs,
  Textarea,
} from "@cloudscape-design/components";
import type { PropertyFilterProps, TableProps } from "@cloudscape-design/components";
import {
  useEffect,
  useState,
} from "react";
import type {
  ActivityLogEntry,
  AwsEc2Instance,
  AwsS3PresignResult,
  AwsS3Bucket,
  AwsS3Object,
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
  makeWorkspaceTab,
  makeFilteringOptions,
  propertyFilterStrings,
  renderProfileDetailPanel,
  renderRuntimeSettingsPanel,
  statusType,
} from "./shared";

type Props = {
  session: SessionSnapshot;
  workspace: WorkspaceSnapshot;
  latestLog?: ActivityLogEntry;
  splitPanelOpen: boolean;
  showSensitiveValues: boolean;
  onToggleSplitPanel: () => void;
  onRefreshDiscovery: () => void;
  onUnlockSession: () => void;
  onToggleSensitiveValues: () => void;
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
  onSelectEC2Region: (region: string) => void;
  onSelectEC2Instance: (instanceId: string) => void;
  onInvokeEC2Action: (action: "start" | "stop" | "reboot", instanceId: string) => void;
};

function defaultUploadKey(sourcePath: string, prefix?: string): string {
  const fileName = sourcePath.split(/[\\/]/).filter(Boolean).pop() ?? "";
  const cleanPrefix = (prefix ?? "").replace(/^\/+/, "");
  if (!cleanPrefix) {
    return fileName;
  }
  return `${cleanPrefix.replace(/\/?$/, "/")}${fileName}`;
}

function renderDetailFields(fields: { label: string; value: string }[], emptyText: string) {
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
          <Box variant="p">{field.value}</Box>
        </div>
      ))}
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

function ec2Command(region: string | undefined, action: string, instanceId: string): string {
  const regionFlag = region ? ` --region ${region}` : "";
  return `aws ec2 ${action}-instances --instance-ids ${instanceId}${regionFlag}`;
}

export default function WorkspaceView({
  session,
  workspace,
  latestLog,
  splitPanelOpen,
  showSensitiveValues,
  onToggleSplitPanel,
  onRefreshDiscovery,
  onUnlockSession,
  onToggleSensitiveValues,
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
  onSelectEC2Region,
  onSelectEC2Instance,
  onInvokeEC2Action,
}: Props) {
  const [uploadSourcePath, setUploadSourcePath] = useState("");
  const [uploadObjectKey, setUploadObjectKey] = useState("");
  const [signedUrlDurationSeconds, setSignedUrlDurationSeconds] = useState("3600");
  const [urlTesterValue, setUrlTesterValue] = useState("");
  const [ec2Query, setEC2Query] = useState<PropertyFilterProps.Query>(defaultQuery);

  useEffect(() => {
    if (!uploadObjectKey && uploadSourcePath) {
      setUploadObjectKey(defaultUploadKey(uploadSourcePath, workspace.s3PrefixFilter));
    }
  }, [uploadObjectKey, uploadSourcePath, workspace.s3PrefixFilter]);

  const workspaceSummaryPanel = (
    <Container
      header={
        <Header
          variant="h2"
          description="Workspace scope and AWS inventory counts coming from the backend workspace snapshot."
        >
          Workspace Summary
        </Header>
      }
    >
      <div className="detail-grid">
        <div className="detail-card">
          <Box variant="awsui-key-label">Provider</Box>
          <Box variant="p">{workspace.provider?.label || "Unavailable"}</Box>
          {workspace.provider ? (
            <StatusIndicator type={statusType(workspace.provider)}>
              {workspace.provider.state}
            </StatusIndicator>
          ) : null}
        </div>
        <div className="detail-card">
          <Box variant="awsui-key-label">Profile</Box>
          <Box variant="p">{workspace.profile?.displayName || "Unavailable"}</Box>
          <Box color="text-body-secondary">
            {workspace.profile?.profileId || "No locked profile selected."}
          </Box>
        </div>
        <div className="detail-card">
          <Box variant="awsui-key-label">Auth Path</Box>
          <Box variant="p">{workspace.authMethod?.toUpperCase() || "Unavailable"}</Box>
          <Box color="text-body-secondary">
            Active auth method for the locked workspace.
          </Box>
        </div>
        <div className="detail-card">
          <Box variant="awsui-key-label">S3 Buckets</Box>
          <Box variant="p">{countLabel(workspace.s3Buckets.length, "bucket", "buckets")}</Box>
          <Box color="text-body-secondary">
            Resource inventory will expand as the AWS adapters are ported.
          </Box>
        </div>
        <div className="detail-card">
          <Box variant="awsui-key-label">S3 Objects</Box>
          <Box variant="p">{countLabel(workspace.s3Objects.length, "object", "objects")}</Box>
          <Box color="text-body-secondary">
            Current object sample visible through the workspace contract.
          </Box>
        </div>
        <div className="detail-card">
          <Box variant="awsui-key-label">EC2 Instances</Box>
          <Box variant="p">
            {countLabel(workspace.ec2Instances.length, "instance", "instances")}
          </Box>
          <Box color="text-body-secondary">
            Lifecycle actions will attach to this inventory next.
          </Box>
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
    </SpaceBetween>
  );

  const selectedBucket = workspace.s3Buckets.find(
    (bucket) => bucket.name === workspace.selectedS3BucketName,
  );
  const selectedObject = workspace.s3Objects.find(
    (object) => object.key === workspace.selectedS3ObjectKey,
  );

  const s3BucketColumns: TableProps.ColumnDefinition<AwsS3Bucket>[] = [
    {
      id: "name",
      header: "Bucket",
      cell: (bucket) => bucket.name,
    },
    {
      id: "createdAt",
      header: "Created",
      cell: (bucket) => bucket.createdAt || "Unknown",
    },
  ];

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

  const s3Tab = (
    <SpaceBetween
      size="l"
      className="page-stack"
    >
      <Container
        header={
          <Header
            variant="h2"
            description="Real bucket inventory and object listings now come from the Go daemon."
          >
            S3 Inventory
          </Header>
        }
      >
        <div className="status-strip">
          <div className="status-pill">
            <Box variant="awsui-key-label">Selected Bucket</Box>
            <Box variant="p">{workspace.selectedS3BucketName || "No bucket selected"}</Box>
          </div>
          <div className="status-pill">
            <Box variant="awsui-key-label">Prefix Filter</Box>
            <Box variant="p">{workspace.s3PrefixFilter || "No prefix filter"}</Box>
          </div>
          <div className="status-pill">
            <Box variant="awsui-key-label">Objects</Box>
            <Box variant="p">{countLabel(workspace.s3Objects.length, "object", "objects")}</Box>
          </div>
        </div>
        <Box color="text-body-secondary">
          {workspace.s3StatusMessage || "S3 inventory is waiting for a locked AWS workspace."}
        </Box>
      </Container>

      <div className="setup-grid">
        <Container
          header={
            <Header
              variant="h2"
              description="Select a bucket to refresh the workspace object listing."
            >
              Buckets
            </Header>
          }
        >
          <Table
            items={workspace.s3Buckets}
            columnDefinitions={s3BucketColumns}
            selectionType="single"
            selectedItems={selectedBucket ? [selectedBucket] : []}
            trackBy="name"
            variant="embedded"
            onSelectionChange={({ detail }) => {
              const bucket = detail.selectedItems[0];
              if (bucket) {
                onSelectS3Bucket(bucket.name);
              }
            }}
            empty={<Box color="text-status-inactive">No S3 buckets loaded for this workspace.</Box>}
          />
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              description={workspace.selectedS3BucketName || "Select a bucket to inspect its objects."}
            >
              Objects
            </Header>
          }
        >
          <SpaceBetween size="m">
            <Input
              value={workspace.s3PrefixFilter || ""}
              placeholder="Filter by prefix, for example reports/"
              onChange={({ detail }) => {
                onSetS3PrefixFilter(detail.value);
              }}
            />
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
                }
              }}
              empty={<Box color="text-status-inactive">No S3 objects loaded for the selected bucket.</Box>}
            />
          </SpaceBetween>
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              description={workspace.selectedS3ObjectKey || "Select an object to inspect metadata."}
            >
              Object Metadata
            </Header>
          }
        >
          {renderDetailFields(
            workspace.s3ObjectMetadata,
            "No metadata loaded for the selected object.",
          )}
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              description="Generated locally from the selected bucket and object. No snippet is stored."
            >
              Copy Snippets
            </Header>
          }
        >
          {workspace.s3ExportSnippets.length === 0 ? (
            <Box color="text-status-inactive">Select an object to generate copy snippets.</Box>
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
        </Container>

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
          <SpaceBetween size="m">
            <Input
              value={uploadSourcePath}
              placeholder="Local file path, for example D:\\Downloads\\report.csv"
              onChange={({ detail }) => {
                setUploadSourcePath(detail.value);
                if (!uploadObjectKey) {
                  setUploadObjectKey(defaultUploadKey(detail.value, workspace.s3PrefixFilter));
                }
              }}
            />
            <Input
              value={uploadObjectKey}
              placeholder="Destination object key"
              onChange={({ detail }) => {
                setUploadObjectKey(detail.value);
              }}
            />
            <Button
              disabled={!workspace.selectedS3BucketName || !uploadSourcePath || !uploadObjectKey}
              onClick={() => {
                onUploadS3Object(uploadSourcePath, uploadObjectKey);
              }}
            >
              Upload
            </Button>
            <Box color="text-body-secondary">{s3UploadStatus}</Box>
          </SpaceBetween>
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              description="Signed URLs are returned through job events and kept in memory only."
            >
              Signed URL
            </Header>
          }
        >
          <SpaceBetween size="m">
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
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              description="Inspect expiry fields locally, then optionally make a range request."
            >
              URL Tester
            </Header>
          }
        >
          <SpaceBetween size="m">
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
      </div>
    </SpaceBetween>
  );

  const ec2Fields: CollectionField<AwsEc2Instance>[] = [
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
  ];
  const filteredEC2Instances = filterCollection(workspace.ec2Instances, ec2Query, ec2Fields);
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
  const ec2FilteringProperties: PropertyFilterProps.FilteringProperty[] = ec2Fields.map(
    (field) => ({
      key: field.key,
      propertyLabel: field.label,
      groupValuesLabel: `${field.label} values`,
      operators: [":", "!:", "=", "!="],
    }),
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
          label: "AWS CLI start command",
          value: ec2Command(workspace.selectedEc2Region, "start", selectedEC2Instance.instanceId),
        },
        {
          label: "AWS CLI stop command",
          value: ec2Command(workspace.selectedEc2Region, "stop", selectedEC2Instance.instanceId),
        },
        {
          label: "AWS CLI reboot command",
          value: ec2Command(workspace.selectedEc2Region, "reboot", selectedEC2Instance.instanceId),
        },
      ]
    : [];
  const selectedEC2State = selectedEC2Instance?.state?.toLowerCase();
  const ec2CanStart = Boolean(selectedEC2Instance) && selectedEC2State === "stopped";
  const ec2CanStop = Boolean(selectedEC2Instance) && selectedEC2State === "running";
  const ec2CanReboot = Boolean(selectedEC2Instance) && selectedEC2State === "running";

  const ec2Tab = (
    <SpaceBetween
      size="l"
      className="page-stack"
    >
      <Container
        header={
          <Header
            variant="h2"
            description="EC2 inventory and lifecycle actions are served by the Go daemon."
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
        </div>
        <Box color="text-body-secondary">
          {workspace.ec2StatusMessage || "EC2 inventory is waiting for a locked AWS workspace."}
        </Box>
      </Container>

      <Container
        header={
          <Header
            variant="h2"
            description="Select a region, filter instances, then choose one instance for lifecycle actions."
            actions={
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
              filteringOptions={makeFilteringOptions(workspace.ec2Instances, ec2Fields)}
              i18nStrings={propertyFilterStrings}
              onChange={({ detail }) => {
                setEC2Query(detail);
              }}
              countText={countLabel(filteredEC2Instances.length, "match", "matches")}
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
                        onInvokeEC2Action("start", selectedEC2Instance.instanceId);
                      }
                    }}
                  >
                    Start
                  </Button>
                  <Button
                    disabled={!ec2CanStop}
                    onClick={() => {
                      if (selectedEC2Instance) {
                        onInvokeEC2Action("stop", selectedEC2Instance.instanceId);
                      }
                    }}
                  >
                    Stop
                  </Button>
                  <Button
                    disabled={!ec2CanReboot}
                    onClick={() => {
                      if (selectedEC2Instance) {
                        onInvokeEC2Action("reboot", selectedEC2Instance.instanceId);
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
        <Box color="text-body-secondary">{ec2ActionStatus}</Box>
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
                  { label: "Private IP", value: selectedEC2Instance.privateIp || "Unavailable" },
                  { label: "Public IP", value: selectedEC2Instance.publicIp || "Unavailable" },
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
    </SpaceBetween>
  );

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
          The new shell keeps the full milestone 1 boundary visible while the Go
          daemon ports the old AWS behaviours behind the new RPC contract.
        </Box>
        <div className="status-strip">
          <div className="status-pill">
            <Box variant="awsui-key-label">Latest Activity</Box>
            <Box variant="p">{latestLog?.message ?? "No activity recorded yet."}</Box>
          </div>
          <div className="status-pill">
            <Box variant="awsui-key-label">Open Tabs</Box>
            <Box variant="p">{countLabel(session.workspaceTabs.length, "tab", "tabs")}</Box>
          </div>
        </div>
      </Container>

      <Tabs
        tabs={session.workspaceTabs.map((tab) =>
          tab.tabId === "overview"
            ? {
                id: tab.tabId,
                label: tab.label,
                content: overviewTab,
              }
            : tab.tabId === "s3"
              ? {
                  id: tab.tabId,
                  label: tab.label,
                  content: s3Tab,
                }
              : tab.tabId === "ec2"
                ? {
                    id: tab.tabId,
                    label: tab.label,
                    content: ec2Tab,
                  }
                : makeWorkspaceTab(tab),
        )}
      />
    </SpaceBetween>
  );
}
