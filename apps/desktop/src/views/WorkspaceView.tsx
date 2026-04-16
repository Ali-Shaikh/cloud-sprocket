import {
  Box,
  Button,
  Container,
  Header,
  Input,
  SpaceBetween,
  StatusIndicator,
  Table,
  Tabs,
} from "@cloudscape-design/components";
import type { TableProps } from "@cloudscape-design/components";
import type {
  ActivityLogEntry,
  AwsS3Bucket,
  AwsS3Object,
  SessionSnapshot,
  WorkspaceSnapshot,
} from "../types/backend";
import {
  countLabel,
  makeWorkspaceTab,
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
};

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
}: Props) {
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
          {workspace.s3ObjectMetadata.length === 0 ? (
            <Box color="text-status-inactive">No metadata loaded for the selected object.</Box>
          ) : (
            <div className="detail-grid">
              {workspace.s3ObjectMetadata.map((field) => (
                <div
                  key={`${field.label}-${field.value}`}
                  className="detail-card"
                >
                  <Box variant="awsui-key-label">{field.label}</Box>
                  <Box variant="p">{field.value}</Box>
                </div>
              ))}
            </div>
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
            : makeWorkspaceTab(tab),
        )}
      />
    </SpaceBetween>
  );
}
