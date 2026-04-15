import {
  Box,
  Button,
  Container,
  Header,
  SpaceBetween,
  StatusIndicator,
  Tabs,
} from "@cloudscape-design/components";
import type {
  ActivityLogEntry,
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
            : makeWorkspaceTab(tab),
        )}
      />
    </SpaceBetween>
  );
}
