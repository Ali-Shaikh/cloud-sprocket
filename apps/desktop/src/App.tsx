import {
  Box,
  Flashbar,
  Icon,
} from "@cloudscape-design/components";
import type { FlashbarProps, IconProps, PropertyFilterProps } from "@cloudscape-design/components";
import {
  lazy,
  Suspense,
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import awsIconUrl from "./assets/cloud-icons/aws.svg";
import awsEc2IconUrl from "./assets/cloud-icons/aws-ec2.svg";
import awsS3IconUrl from "./assets/cloud-icons/aws-s3.svg";
import azureIconUrl from "./assets/cloud-icons/azure.svg";
import gcpIconUrl from "./assets/cloud-icons/gcp.svg";
import { backendRequest, subscribeToBackendEvent } from "./lib/backend";
import type {
  ActivityLogEntry,
  AppSettingsSnapshot,
  AwsEc2Instance,
  AwsS3PresignResult,
  AwsS3UploadResult,
  AwsS3Bucket,
  AwsS3ExportSnippet,
  AwsS3Object,
  AzureResourceGroup,
  AzureVirtualMachine,
  DetailField,
  DockerRuntimeSnapshot,
  EmulatorSummary,
  JobStatus,
  JobLifecycle,
  LocalConfigArtifact,
  ManagedDockerResource,
  ProfileSummary,
  ProviderSummary,
  SessionSnapshot,
  StateChangedPayload,
  UrlInspection,
  UrlValidationResult,
  WorkspaceSnapshot,
} from "./types/backend";
import { defaultQuery, renderLogEntries, type TablePreferences } from "./views/shared";

const SessionSetupView = lazy(() => import("./views/SessionSetupView"));
const WorkspaceView = lazy(() => import("./views/WorkspaceView"));
const appVersion = "0.1.18";

type EC2LifecycleAction = "start" | "stop" | "reboot";

type EC2ActionHistoryItem = {
  jobId: string;
  status: JobLifecycle;
  message: string;
  completedAt?: string;
};

type SidebarItem = {
  id: string;
  label: string;
  detail: string;
  iconName?: IconProps.Name;
  iconUrl?: string;
  providerId?: string;
  badge?: string;
};

type SidebarSubItem = {
  id: string;
  label: string;
};

const providerIconUrls: Record<string, string> = {
  aws: awsIconUrl,
  azure: azureIconUrl,
  gcp: gcpIconUrl,
  google: gcpIconUrl,
  "google-cloud": gcpIconUrl,
};

function CloudProviderIcon({ providerId }: { providerId?: string }) {
  const iconUrl = providerIconUrls[providerId?.toLowerCase() ?? ""];
  if (iconUrl) {
    return (
      <img
        className="cloud-provider-icon"
        src={iconUrl}
        alt=""
        aria-hidden="true"
      />
    );
  }
  return (
    <Icon
      name="globe"
      variant="inverted"
    />
  );
}

function sidebarItemIconClass(item: SidebarItem): string {
  return `sidebar-item-icon${item.providerId || item.iconUrl ? " sidebar-item-icon-provider" : ""}`;
}

function SidebarGlyph({ item }: { item: SidebarItem }) {
  if (item.iconUrl) {
    return (
      <img
        className="cloud-provider-icon"
        src={item.iconUrl}
        alt=""
        aria-hidden="true"
      />
    );
  }
  if (item.providerId) {
    return <CloudProviderIcon providerId={item.providerId} />;
  }
  return (
    <Icon
      name={item.iconName ?? "status-info"}
      variant="inverted"
    />
  );
}

function workspaceTabIconUrl(tabId: string): string | undefined {
  if (tabId === "s3") {
    return awsS3IconUrl;
  }
  if (tabId === "ec2") {
    return awsEc2IconUrl;
  }
  if (tabId === "virtualisation") {
    return undefined;
  }
  if (tabId === "azure-overview" || tabId === "azure-resource-groups" || tabId === "azure-vms") {
    return azureIconUrl;
  }
  return undefined;
}

function workspaceTabIcon(tabId: string): IconProps.Name {
  if (tabId === "s3") {
    return "folder";
  }
  if (tabId === "ec2") {
    return "grid-view";
  }
  if (tabId === "virtualisation") {
    return "settings";
  }
  if (tabId === "azure-overview" || tabId === "gcp-overview") {
    return "settings";
  }
  if (tabId === "azure-resource-groups") {
    return "folder";
  }
  if (tabId === "azure-vms") {
    return "grid-view";
  }
  if (tabId === "actions") {
    return "notification";
  }
  return "view-full";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isS3UploadResult(value: unknown): value is AwsS3UploadResult {
  return isRecord(value) && typeof value.destinationUri === "string";
}

function isS3PresignResult(value: unknown): value is AwsS3PresignResult {
  return isRecord(value) && typeof value.url === "string" && typeof value.objectKey === "string";
}

function isUrlValidationResult(value: unknown): value is UrlValidationResult {
  return isRecord(value) && typeof value.url === "string" && typeof value.summary === "string";
}

function isWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
  return isRecord(value) && Array.isArray(value.ec2Instances) && typeof value.runtimeSettings === "object";
}

function normaliseArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function normaliseProvider(provider: ProviderSummary): ProviderSummary {
  return {
    ...provider,
    locations: normaliseArray(provider.locations),
  };
}

function normaliseProfile(profile: ProfileSummary): ProfileSummary {
  return {
    ...profile,
    sourcePaths: normaliseArray(profile.sourcePaths),
    attributes: normaliseArray(profile.attributes),
    authMethods: normaliseArray(profile.authMethods),
  };
}

function normaliseDetailFields(fields: DetailField[] | null | undefined): DetailField[] {
  return normaliseArray(fields);
}

function normaliseDockerResource(resource: ManagedDockerResource): ManagedDockerResource {
  return {
    ...resource,
    details: normaliseDetailFields(resource.details),
  };
}

function normaliseEmulatorSummary(emulator: EmulatorSummary): EmulatorSummary {
  return {
    ...emulator,
    details: normaliseDetailFields(emulator.details),
  };
}

function normaliseLocalConfigArtifact(artifact: LocalConfigArtifact): LocalConfigArtifact {
  return { ...artifact };
}

function normaliseAzureResourceGroup(resourceGroup: AzureResourceGroup): AzureResourceGroup {
  return {
    ...resourceGroup,
    tags: normaliseDetailFields(resourceGroup.tags),
  };
}

function normaliseAzureVirtualMachine(vm: AzureVirtualMachine): AzureVirtualMachine {
  return {
    ...vm,
    tags: normaliseDetailFields(vm.tags),
  };
}

function normaliseS3Bucket(bucket: AwsS3Bucket): AwsS3Bucket {
  return { ...bucket };
}

function normaliseS3Object(object: AwsS3Object): AwsS3Object {
  return { ...object };
}

function normaliseS3ExportSnippet(snippet: AwsS3ExportSnippet): AwsS3ExportSnippet {
  return { ...snippet };
}

function normaliseEC2Instance(instance: AwsEc2Instance): AwsEc2Instance {
  return {
    ...instance,
    securityGroups: normaliseArray(instance.securityGroups),
    tags: normaliseDetailFields(instance.tags),
  };
}

function normaliseSessionSnapshot(snapshot: Partial<SessionSnapshot> | null | undefined): SessionSnapshot {
  return {
    ...emptySession,
    ...(snapshot ?? {}),
    isLocked: snapshot?.isLocked ?? false,
    availableAuthMethods: normaliseArray(snapshot?.availableAuthMethods),
    workspaceTabs: normaliseArray(snapshot?.workspaceTabs),
  };
}

function dockerDiagnosticsFromRuntime(runtime: DockerRuntimeSnapshot): WorkspaceSnapshot["dockerDiagnostics"] {
  return {
    engineState: runtime.reachable ? "available" : runtime.host ? "unavailable" : "unknown",
    summary: runtime.summary,
    contextName: runtime.contextName,
    host: runtime.host,
    details: runtime.details,
  };
}

function expectedEC2State(action: EC2LifecycleAction): string {
  return action === "stop" ? "stopped" : "running";
}

function ec2InstanceState(workspaceSnapshot: WorkspaceSnapshot, instanceId: string): string {
  return workspaceSnapshot.ec2Instances.find((instance) => instance.instanceId === instanceId)?.state?.toLowerCase() ?? "";
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

function AppSidebar({
  session,
  selectedProvider,
  selectedProfile,
  workspace,
  activeWorkspaceTabId,
  activeS3PageId,
  activeAzurePageId,
  collapsed,
  activityOpen,
  onToggleCollapsed,
  onToggleActivity,
  onLockSession,
  onWorkspaceTabChange,
  onS3PageChange,
  onAzurePageChange,
  onRefreshDiscovery,
}: {
  session: SessionSnapshot;
  selectedProvider?: ProviderSummary;
  selectedProfile?: ProfileSummary;
  workspace: WorkspaceSnapshot;
  activeWorkspaceTabId: string;
  activeS3PageId: string;
  activeAzurePageId: string;
  collapsed: boolean;
  activityOpen: boolean;
  onToggleCollapsed: () => void;
  onToggleActivity: () => void;
  onLockSession: () => void;
  onWorkspaceTabChange: (tabId: string) => void;
  onS3PageChange: (pageId: string) => void;
  onAzurePageChange: (pageId: string) => void;
  onRefreshDiscovery: () => void;
}) {
  const setupItems: SidebarItem[] = [
    {
      id: "provider",
      label: "Provider",
      detail: selectedProvider?.label ?? "Choose provider",
      providerId: selectedProvider?.providerId,
      badge: selectedProvider ? "Done" : "Open",
    },
    {
      id: "profile",
      label: "Profile",
      detail: selectedProfile?.displayName ?? "Choose profile",
      iconName: "user-profile",
      badge: selectedProfile ? "Done" : "Open",
    },
    {
      id: "auth",
      label: "Auth",
      detail: session.selectedAuthMethod?.toUpperCase() ?? "Choose auth",
      iconName: "key",
      badge: session.selectedAuthMethod ? "Done" : "Open",
    },
    {
      id: "lock",
      label: "Lock",
      detail: selectedProfile && session.selectedAuthMethod ? "Ready" : "Waiting",
      iconName: "lock-private",
      badge: selectedProfile && session.selectedAuthMethod ? "Ready" : "Open",
    },
  ];

  const workspaceItems: SidebarItem[] = session.workspaceTabs.map((tab) => {
    const badge =
      tab.tabId === "s3"
        ? String(workspace.s3Buckets.length)
        : tab.tabId === "ec2"
          ? String(workspace.ec2Instances.length)
          : tab.tabId === "virtualisation"
            ? String(workspace.emulatorSummaries.length)
          : tab.tabId === "azure-resource-groups"
            ? String(workspace.azureResourceGroups.length)
            : tab.tabId === "azure-vms"
              ? String(workspace.azureVirtualMachines.length)
          : undefined;
    return {
      id: tab.tabId,
      label: tab.label,
      detail: tab.summary,
      iconName: workspaceTabIcon(tab.tabId),
      iconUrl: workspaceTabIconUrl(tab.tabId),
      badge,
    };
  });

  const workspaceSubItems: Record<string, SidebarSubItem[]> = {
    s3: [
      { id: "objects", label: "Objects" },
      { id: "upload", label: "Upload" },
      { id: "url-tester", label: "URL Tools" },
    ],
    "azure-overview": [
      { id: "overview", label: "Overview" },
      { id: "resource-groups", label: "Resource Groups" },
      { id: "virtual-machines", label: "Virtual Machines" },
    ],
  };

  const openWorkspaceSubPage = (tabId: string, pageId: string) => {
    onWorkspaceTabChange(tabId);
    if (tabId === "s3") {
      onS3PageChange(pageId);
    }
    if (tabId === "azure-overview") {
      onAzurePageChange(pageId);
    }
  };

  return (
    <aside className={`app-sidebar${collapsed ? " app-sidebar-collapsed" : ""}`}>
      <div className="sidebar-brand">
        <div className="brand-mark">CS</div>
        <div className="brand-copy">
          <div className="brand-title">CloudSprocket</div>
          <div className="brand-subtitle">
            {session.isLocked ? "Locked workspace" : "Session setup"}
          </div>
        </div>
        <button
          type="button"
          className="sidebar-collapse-button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggleCollapsed}
        >
          <Icon
            name={collapsed ? "angle-right" : "angle-left"}
            variant="inverted"
          />
        </button>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">
          {session.isLocked ? "Workspace" : "Setup"}
        </div>
        <div className="sidebar-menu">
          {(session.isLocked ? workspaceItems : setupItems).map((item) => {
            const active = session.isLocked
              ? item.id === activeWorkspaceTabId
              : item.badge === "Open" || item.badge === "Ready";
            return session.isLocked ? (
              <div
                key={item.id}
                className="sidebar-menu-group"
              >
                <button
                  type="button"
                  className={`sidebar-menu-item${active ? " sidebar-menu-item-active" : ""}`}
                    onClick={() => {
                      onWorkspaceTabChange(item.id);
                      if (item.id === "s3") {
                        onS3PageChange("objects");
                      }
                      if (item.id === "azure-overview") {
                        onAzurePageChange("overview");
                      }
                    }}
                  title={`${item.label}: ${item.detail}`}
                >
                  <span className={sidebarItemIconClass(item)}>
                    <SidebarGlyph item={item} />
                  </span>
                  <span className="sidebar-item-copy">
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </span>
                  {item.badge ? <em>{item.badge}</em> : null}
                </button>
                {active && workspaceSubItems[item.id] && !collapsed ? (
                  <div className="sidebar-submenu">
                    {workspaceSubItems[item.id].map((subItem) => (
                      <button
                        key={subItem.id}
                        type="button"
                        className={`sidebar-submenu-item${
                          (item.id === "s3" && activeS3PageId === subItem.id) ||
                          (item.id === "azure-overview" && activeAzurePageId === subItem.id)
                            ? " sidebar-submenu-item-active"
                            : ""
                        }`}
                        onClick={() => {
                          openWorkspaceSubPage(item.id, subItem.id);
                        }}
                      >
                        {subItem.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div
                key={item.id}
                className={`sidebar-menu-item${active ? " sidebar-menu-item-active" : ""}`}
                title={`${item.label}: ${item.detail}`}
              >
                <span className={sidebarItemIconClass(item)}>
                  <SidebarGlyph item={item} />
                </span>
                <span className="sidebar-item-copy">
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
                {item.badge ? <em>{item.badge}</em> : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="sidebar-section sidebar-context">
        <div className="sidebar-section-label">Context</div>
        <dl>
          <div>
            <dt>Provider</dt>
            <dd>{selectedProvider?.label ?? workspace.provider?.label ?? "None"}</dd>
          </div>
          <div>
            <dt>Profile</dt>
            <dd>{selectedProfile?.displayName ?? workspace.profile?.displayName ?? "None"}</dd>
          </div>
          <div>
            <dt>Auth</dt>
            <dd>{session.lockedAuthMethod ?? session.selectedAuthMethod ?? "None"}</dd>
          </div>
        </dl>
      </div>

      <div className="sidebar-footer">
        {!session.isLocked ? (
          <button
            type="button"
            className="sidebar-action sidebar-lock-action"
            disabled={!selectedProfile || !session.selectedAuthMethod}
            onClick={onLockSession}
            title="Lock workspace"
            aria-label="Lock workspace"
          >
            <span className="sidebar-action-icon">
              <Icon name="lock-private" />
            </span>
            <span className="sidebar-action-copy">Lock Workspace</span>
          </button>
        ) : null}
        <button
          type="button"
          className={`sidebar-action sidebar-action-secondary${activityOpen ? " sidebar-action-active" : ""}`}
          onClick={onToggleActivity}
          title={activityOpen ? "Hide Activity" : "Show Activity"}
          aria-label={activityOpen ? "Hide Activity" : "Show Activity"}
        >
          <span className="sidebar-action-icon">
            <Icon
              name="history"
              variant="inverted"
            />
          </span>
          <span className="sidebar-action-copy">
            {activityOpen ? "Hide Activity" : "Activity"}
          </span>
        </button>
        <button
          type="button"
          className="sidebar-action"
          onClick={onRefreshDiscovery}
          title="Refresh discovery"
          aria-label="Refresh discovery"
        >
          <span className="sidebar-action-icon">
            <Icon name="refresh" />
          </span>
          <span className="sidebar-action-copy">Refresh</span>
        </button>
      </div>
    </aside>
  );
}

const emptySession: SessionSnapshot = {
  isLocked: false,
  availableAuthMethods: [],
  workspaceTabs: [],
};

const emptySettings: AppSettingsSnapshot = {
  platformName: "",
  configDir: "",
  databasePath: "",
  logPath: "",
  runtimeMode: "cloud",
  localConfigDir: "",
  emulatorStateDir: "",
  localStackImage: "localstack/localstack:stable",
};

const emptyWorkspace: WorkspaceSnapshot = {
  runtimeSettings: emptySettings,
  environmentDiagnostics: [],
  dockerDiagnostics: {
    engineState: "unknown",
    summary: "Docker diagnostics are not available yet.",
    details: [],
  },
  dockerRuntime: {
    reachable: false,
    resourceOwnership: {
      labelKey: "com.cloudsprocket.managed",
      labelValue: "true",
      projectLabelKey: "com.cloudsprocket.project",
      projectName: "cloud-sprocket",
      summary: "Only CloudSprocket-managed Docker resources are eligible for future lifecycle control.",
    },
    summary: "Docker runtime details are not available yet.",
    details: [],
  },
  dockerResources: [],
  emulatorSummaries: [],
  localConfigArtifacts: [],
  awsWritesEnabled: false,
  azureResourceGroups: [],
  azureVirtualMachines: [],
  s3Buckets: [],
  s3Objects: [],
  s3ObjectMetadata: [],
  s3ExportSnippets: [],
  ec2Regions: [],
  ec2Instances: [],
};

function normaliseWorkspaceSnapshot(snapshot: Partial<WorkspaceSnapshot> | null | undefined): WorkspaceSnapshot {
  const source = snapshot ?? {};
  const dockerRuntime = source.dockerRuntime ?? emptyWorkspace.dockerRuntime;
  const dockerDiagnostics = source.dockerDiagnostics ?? emptyWorkspace.dockerDiagnostics;

  return {
    ...emptyWorkspace,
    ...source,
    provider: source.provider ? normaliseProvider(source.provider) : undefined,
    profile: source.profile ? normaliseProfile(source.profile) : undefined,
    runtimeSettings: {
      ...emptySettings,
      ...(source.runtimeSettings ?? {}),
    },
    environmentDiagnostics: normaliseArray(source.environmentDiagnostics),
    dockerDiagnostics: {
      ...emptyWorkspace.dockerDiagnostics,
      ...dockerDiagnostics,
      details: normaliseArray(dockerDiagnostics.details),
    },
    dockerRuntime: {
      ...emptyWorkspace.dockerRuntime,
      ...dockerRuntime,
      resourceOwnership: {
        ...emptyWorkspace.dockerRuntime.resourceOwnership,
        ...(dockerRuntime.resourceOwnership ?? {}),
      },
      details: normaliseArray(dockerRuntime.details),
    },
    dockerResources: normaliseArray(source.dockerResources).map(normaliseDockerResource),
    emulatorSummaries: normaliseArray(source.emulatorSummaries).map(normaliseEmulatorSummary),
    localConfigArtifacts: normaliseArray(source.localConfigArtifacts).map(normaliseLocalConfigArtifact),
    awsWritesEnabled: source.awsWritesEnabled ?? false,
    azureResourceGroups: normaliseArray(source.azureResourceGroups).map(normaliseAzureResourceGroup),
    azureVirtualMachines: normaliseArray(source.azureVirtualMachines).map(normaliseAzureVirtualMachine),
    s3Buckets: normaliseArray(source.s3Buckets).map(normaliseS3Bucket),
    s3Objects: normaliseArray(source.s3Objects).map(normaliseS3Object),
    s3ObjectMetadata: normaliseDetailFields(source.s3ObjectMetadata),
    s3ExportSnippets: normaliseArray(source.s3ExportSnippets).map(normaliseS3ExportSnippet),
    ec2Regions: normaliseArray(source.ec2Regions),
    ec2Instances: normaliseArray(source.ec2Instances).map(normaliseEC2Instance),
  };
}

export default function App() {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [session, setSession] = useState<SessionSnapshot>(emptySession);
  const [appSettings, setAppSettings] = useState<AppSettingsSnapshot>(emptySettings);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot>(emptyWorkspace);
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [notifications, setNotifications] = useState<FlashbarProps.MessageDefinition[]>([]);
  const [s3UploadStatus, setS3UploadStatus] = useState("Select a bucket and provide a local file path to upload.");
  const [s3SignedUrlStatus, setS3SignedUrlStatus] = useState("Select an object to generate a signed URL.");
  const [s3SignedUrlResult, setS3SignedUrlResult] = useState<AwsS3PresignResult>();
  const [s3UrlInspection, setS3UrlInspection] = useState<UrlInspection>();
  const [s3UrlValidation, setS3UrlValidation] = useState<UrlValidationResult>();
  const [localStackAuthToken, setLocalStackAuthToken] = useState("");
  const [localStackPersistence, setLocalStackPersistence] = useState(false);
  const [localStackEnvironmentText, setLocalStackEnvironmentText] = useState("");
  const [ec2ActionStatus, setEC2ActionStatus] = useState("Select an EC2 instance to run lifecycle actions.");
  const [ec2ActionInFlight, setEC2ActionInFlight] = useState(false);
  const [ec2ActionHistory, setEC2ActionHistory] = useState<EC2ActionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSensitiveValues, setShowSensitiveValues] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [splitPanelOpen, setSplitPanelOpen] = useState(false);
  const [activeWorkspaceTabId, setActiveWorkspaceTabId] = useState("overview");
  const [activeS3PageId, setActiveS3PageId] = useState("objects");
  const [activeAzurePageId, setActiveAzurePageId] = useState("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [providerQuery, setProviderQuery] = useState<PropertyFilterProps.Query>(
    defaultQuery,
  );
  const [profileQuery, setProfileQuery] = useState<PropertyFilterProps.Query>(defaultQuery);
  const s3PrefixRequestIdRef = useRef(0);
  const ec2ActionPollRef = useRef(0);
  const workspaceLoadRequestIdRef = useRef(0);
  const [providerPreferences, setProviderPreferences] = useState<TablePreferences>({
    wrapLines: false,
    stripedRows: true,
    contentDensity: "comfortable",
    contentDisplay: [
      { id: "provider", visible: true },
      { id: "state", visible: true },
      { id: "profiles", visible: true },
      { id: "summary", visible: true },
    ],
  });
  const [profilePreferences, setProfilePreferences] = useState<TablePreferences>({
    wrapLines: false,
    stripedRows: true,
    contentDensity: "comfortable",
    contentDisplay: [
      { id: "name", visible: true },
      { id: "identifier", visible: true },
      { id: "summary", visible: true },
    ],
  });

  const isTablet = viewportWidth < 1180;
  const selectedProvider = providers.find(
    (provider) => provider.providerId === session.currentProviderId,
  );
  const selectedProfile = profiles.find(
    (profile) => profile.profileId === session.selectedProfileId,
  );
  const latestLog = logs[0];

  function cancelEC2Polling(): void {
    ec2ActionPollRef.current += 1;
  }

  async function pollEC2ActionResult(action: EC2LifecycleAction, instanceId: string): Promise<void> {
    const pollId = ec2ActionPollRef.current + 1;
    ec2ActionPollRef.current = pollId;
    const desiredState = expectedEC2State(action);
    let latestState = "";

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await wait(attempt === 0 ? 900 : 1500);
      if (pollId !== ec2ActionPollRef.current) {
        return;
      }

      const workspaceResult = await backendRequest<WorkspaceSnapshot>("workspace.get");
      latestState = ec2InstanceState(workspaceResult, instanceId);
      startTransition(() => {
        setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
      });

      if (latestState === desiredState) {
        setEC2ActionStatus(`EC2 ${action} completed for ${instanceId}. Current state: ${latestState}.`);
        setEC2ActionInFlight(false);
        return;
      }
    }

    setEC2ActionStatus(
      `EC2 ${action} request was sent for ${instanceId}. Latest observed state: ${latestState || "unknown"}.`,
    );
    setEC2ActionInFlight(false);
  }

  const loadState = useEffectEvent(async () => {
    setLoading(true);
    try {
      const providersResult = await backendRequest<ProviderSummary[]>("providers.list");
      const sessionResult = await backendRequest<SessionSnapshot>("session.get");
      const nextSession = normaliseSessionSnapshot(sessionResult);
      const profilesResult = await backendRequest<ProfileSummary[]>("profiles.list", {
        providerId: nextSession.currentProviderId,
      });
      const settingsResult = await backendRequest<AppSettingsSnapshot>("app.settings.get");
      const logsResult = await backendRequest<ActivityLogEntry[]>("logs.list", {
        limit: 50,
      });
      startTransition(() => {
        setProviders(normaliseArray(providersResult).map(normaliseProvider));
        setProfiles(normaliseArray(profilesResult).map(normaliseProfile));
        setSession(nextSession);
        setAppSettings(settingsResult);
        setLogs(logsResult);
      });
    } finally {
      setLoading(false);
    }
  });

  const loadWorkspace = useEffectEvent(async (nextSession: SessionSnapshot) => {
    const requestId = workspaceLoadRequestIdRef.current + 1;
    workspaceLoadRequestIdRef.current = requestId;
    if (!nextSession.isLocked) {
      startTransition(() => {
        if (requestId === workspaceLoadRequestIdRef.current) {
          setWorkspace(emptyWorkspace);
        }
      });
      return;
    }

    const workspaceResult = await backendRequest<WorkspaceSnapshot>("workspace.get");
    startTransition(() => {
      if (requestId === workspaceLoadRequestIdRef.current) {
        setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
      }
    });
  });

  const onStateChanged = useEffectEvent((payload: StateChangedPayload) => {
    startTransition(() => {
      setProviders(normaliseArray(payload.providers).map(normaliseProvider));
      setProfiles(normaliseArray(payload.profiles).map(normaliseProfile));
      setSession(normaliseSessionSnapshot(payload.session));
    });
  });

  const onLogAppended = useEffectEvent((entry: ActivityLogEntry) => {
    startTransition(() => {
      setLogs((current) => [entry, ...current].slice(0, 50));
    });
  });

  const onJobUpdated = useEffectEvent((job: JobStatus) => {
    const type =
      job.status === "failed"
        ? "error"
        : job.status === "completed"
          ? "success"
          : "info";
    if (job.label === "S3 Upload") {
      setS3UploadStatus(job.message);
      if (job.status === "completed" && isS3UploadResult(job.result)) {
        void loadWorkspace(session);
      }
    }
    if (job.label === "S3 Signed URL") {
      setS3SignedUrlStatus(job.message);
      if (isS3PresignResult(job.result)) {
        setS3SignedUrlResult(job.result);
      }
    }
    if (job.label === "S3 URL Validation") {
      if (isUrlValidationResult(job.result)) {
        setS3UrlValidation(job.result);
      }
    }
    if (job.label === "EC2 Action") {
      setEC2ActionStatus(job.message);
      setEC2ActionInFlight(job.status === "queued" || job.status === "running");
      setEC2ActionHistory((current) => {
        const next: EC2ActionHistoryItem = {
          jobId: job.jobId,
          status: job.status,
          message: job.message,
          completedAt: job.completedAt,
        };
        return [next, ...current.filter((item) => item.jobId !== job.jobId)].slice(0, 6);
      });
      const workspaceResult = job.result;
      if (job.status === "completed" && isWorkspaceSnapshot(workspaceResult)) {
        cancelEC2Polling();
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
      } else if (job.status === "completed" || job.status === "failed") {
        cancelEC2Polling();
        void loadWorkspace(session);
      }
    }
    startTransition(() => {
      setNotifications((current) => {
        const next: FlashbarProps.MessageDefinition = {
          id: job.jobId,
          type,
          content: `${job.label}: ${job.message}`,
          dismissible: true,
          onDismiss: () => {
            setNotifications((items) => items.filter((item) => item.id !== job.jobId));
          },
        };
        return [next, ...current.filter((item) => item.id !== job.jobId)].slice(0, 3);
      });
    });
  });

  useEffect(() => {
    let active = true;
    const cleanups: Array<() => void> = [];

    void loadState();
    void Promise.all([
      subscribeToBackendEvent("state.changed", (payload) => {
        if (active) {
          onStateChanged(payload);
        }
      }),
      subscribeToBackendEvent("log.appended", (payload) => {
        if (active) {
          onLogAppended(payload);
        }
      }),
      subscribeToBackendEvent("job.updated", (payload) => {
        if (active) {
          onJobUpdated(payload);
        }
      }),
    ]).then((unsubscribers) => {
      cleanups.push(...unsubscribers);
    });

    return () => {
      active = false;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  useEffect(() => {
    function onResize() {
      setViewportWidth(window.innerWidth);
    }

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    void loadWorkspace(session);
  }, [
    session.isLocked,
    session.lockedAuthMethod,
    session.lockedProfileId,
    session.lockedProviderId,
  ]);

  useEffect(() => {
    setShowSensitiveValues(false);
  }, [selectedProfile?.profileId, session.isLocked]);

  useEffect(() => {
    setProfileQuery(defaultQuery());
  }, [session.currentProviderId]);

  useEffect(() => {
    if (isTablet) {
      setSplitPanelOpen(false);
    }
  }, [isTablet]);

  useEffect(() => {
    if (!session.isLocked) {
      setActiveWorkspaceTabId("overview");
      setActiveS3PageId("objects");
      setActiveAzurePageId("overview");
      return;
    }
    if (
      session.workspaceTabs.length > 0 &&
      !session.workspaceTabs.some((tab) => tab.tabId === activeWorkspaceTabId)
    ) {
      setActiveWorkspaceTabId(session.workspaceTabs[0].tabId);
    }
  }, [activeWorkspaceTabId, session.isLocked, session.workspaceTabs]);

  async function mutateSession(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<void> {
    const nextSession = await backendRequest<SessionSnapshot>(method, params);
    const normalisedSession = normaliseSessionSnapshot(nextSession);
    startTransition(() => {
      setSession(normalisedSession);
    });
    await loadWorkspace(normalisedSession);
    await loadState();
  }

  async function refreshDiscovery(): Promise<void> {
    await backendRequest<JobStatus>("actions.invoke", {
      actionId: "refresh",
    });
  }

  async function refreshDockerRuntime(): Promise<void> {
    const [dockerRuntime, dockerResources] = await Promise.all([
      backendRequest<DockerRuntimeSnapshot>("docker.runtime.get"),
      backendRequest<ManagedDockerResource[]>("docker.resources.list"),
    ]);
    startTransition(() => {
      setWorkspace((current) => normaliseWorkspaceSnapshot({
        ...normaliseWorkspaceSnapshot(current),
        dockerRuntime,
        dockerResources,
        dockerDiagnostics: dockerDiagnosticsFromRuntime(dockerRuntime),
      }));
    });
  }

  function localStackEnvironment(): Record<string, string> {
    return Object.fromEntries(
      localStackEnvironmentText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const separator = line.indexOf("=");
          if (separator < 1) {
            return ["", ""] as const;
          }
          return [line.slice(0, separator).trim(), line.slice(separator + 1)] as const;
        })
        .filter(([key]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && key !== "LOCALSTACK_AUTH_TOKEN"),
    );
  }

  async function invokeLocalStackAction(action: "prepareProfile" | "start" | "stop"): Promise<void> {
    const method =
      action === "prepareProfile"
        ? "emulators.prepareProfile"
        : action === "start"
          ? "emulators.start"
          : "emulators.stop";
    const startParams =
      action === "start"
        ? {
          authToken: localStackAuthToken.trim(),
          persistence: localStackPersistence,
          environment: localStackEnvironment(),
        }
        : {};
    await backendRequest<unknown>(
      method,
      startParams,
    );
    await loadWorkspace(session);
  }

  const activityDrawer = splitPanelOpen ? (
    <aside
      className="activity-drawer"
      aria-label="Recent Activity"
    >
      <div className="activity-drawer-header">
        <div>
          <Box variant="awsui-key-label">
            {session.isLocked ? "Workspace" : "Discovery"}
          </Box>
          <h2>Recent Activity</h2>
        </div>
        <button
          type="button"
          className="activity-drawer-close"
          onClick={() => {
            setSplitPanelOpen(false);
          }}
        >
          Close
        </button>
      </div>
      <div className="log-stream">{renderLogEntries(logs)}</div>
    </aside>
  ) : null;

  const content = session.isLocked ? (
    <WorkspaceView
      session={session}
      workspace={workspace}
      logs={logs}
      latestLog={latestLog}
      activeTabId={activeWorkspaceTabId}
      activeS3PageId={activeS3PageId}
      activeAzurePageId={activeAzurePageId}
      splitPanelOpen={splitPanelOpen}
      showSensitiveValues={showSensitiveValues}
      onToggleSplitPanel={() => {
        setSplitPanelOpen((current) => !current);
      }}
      onRefreshDiscovery={() => {
        void refreshDiscovery();
      }}
      onRefreshDockerRuntime={() => {
        void refreshDockerRuntime();
      }}
      onInvokeLocalStackAction={(action) => {
        void invokeLocalStackAction(action);
      }}
      localStackAuthToken={localStackAuthToken}
      onLocalStackAuthTokenChange={setLocalStackAuthToken}
      localStackPersistence={localStackPersistence}
      onLocalStackPersistenceChange={setLocalStackPersistence}
      localStackEnvironmentText={localStackEnvironmentText}
      onLocalStackEnvironmentTextChange={setLocalStackEnvironmentText}
      onUnlockSession={() => {
        void mutateSession("session.unlock");
      }}
      onToggleSensitiveValues={() => {
        setShowSensitiveValues((current) => !current);
      }}
      onInvokeWorkspaceAction={(actionId) => {
        void backendRequest<JobStatus>("actions.invoke", { actionId });
      }}
      onSelectS3Bucket={(bucketName) => {
        setS3SignedUrlResult(undefined);
        void backendRequest<WorkspaceSnapshot>("aws.s3.selectBucket", { bucketName }).then(
          (workspaceResult) => {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
            });
          },
        );
      }}
      onSelectS3Object={(objectKey) => {
        setS3SignedUrlResult(undefined);
        void backendRequest<WorkspaceSnapshot>("aws.s3.selectObject", { objectKey }).then(
          (workspaceResult) => {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
            });
          },
        );
      }}
      onSetS3PrefixFilter={(prefix) => {
        const requestId = s3PrefixRequestIdRef.current + 1;
        s3PrefixRequestIdRef.current = requestId;
        void backendRequest<WorkspaceSnapshot>("aws.s3.setPrefixFilter", { prefix }).then(
          (workspaceResult) => {
            if (requestId === s3PrefixRequestIdRef.current) {
              startTransition(() => {
                setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
              });
            }
          },
        );
      }}
      s3UploadStatus={s3UploadStatus}
      s3SignedUrlStatus={s3SignedUrlStatus}
      s3SignedUrlResult={s3SignedUrlResult}
      s3UrlInspection={s3UrlInspection}
      s3UrlValidation={s3UrlValidation}
      onUploadS3Object={(sourcePath, objectKey) => {
        setS3UploadStatus(`Queueing upload for ${objectKey}.`);
        void backendRequest<JobStatus>("aws.s3.uploadObject", { sourcePath, objectKey }).then(
          (job) => {
            setS3UploadStatus(job.message);
          },
        );
      }}
      onPresignS3Object={(durationSeconds) => {
        setS3SignedUrlResult(undefined);
        setS3SignedUrlStatus("Queueing signed URL generation.");
        void backendRequest<JobStatus>("aws.s3.presignObject", { durationSeconds }).then(
          (job) => {
            setS3SignedUrlStatus(job.message);
          },
        );
      }}
      onAnalyseS3Url={(url) => {
        void backendRequest<UrlInspection>("aws.s3.analyseUrl", { url }).then((inspection) => {
          setS3UrlInspection(inspection);
        });
      }}
      onValidateS3Url={(url) => {
        void backendRequest<JobStatus>("aws.s3.validateUrl", { url });
      }}
      ec2ActionStatus={ec2ActionStatus}
      ec2ActionInFlight={ec2ActionInFlight}
      ec2ActionHistory={ec2ActionHistory}
      onRefreshEC2Instances={() => {
        const region = workspace.selectedEc2Region;
        if (!region) {
          setEC2ActionStatus("Select an EC2 region before refreshing inventory.");
          return;
        }
        setEC2ActionStatus(`Refreshing EC2 inventory for ${region}.`);
        void backendRequest<WorkspaceSnapshot>("aws.ec2.selectRegion", { region }).then(
          (workspaceResult) => {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
            });
            setEC2ActionStatus(workspaceResult.ec2StatusMessage || `EC2 inventory refreshed for ${region}.`);
          },
        ).catch((error: unknown) => {
          setEC2ActionStatus(error instanceof Error ? error.message : String(error));
        });
      }}
      onSelectEC2Region={(region) => {
        setEC2ActionStatus("Select an instance to run lifecycle actions.");
        setEC2ActionInFlight(false);
        cancelEC2Polling();
        void backendRequest<WorkspaceSnapshot>("aws.ec2.selectRegion", { region }).then(
          (workspaceResult) => {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
            });
          },
        );
      }}
      onSelectEC2Instance={(instanceId) => {
        setEC2ActionStatus("Instance selected. EC2 lifecycle writes require a local endpoint profile with write opt-in.");
        setEC2ActionInFlight(false);
        cancelEC2Polling();
        void backendRequest<WorkspaceSnapshot>("aws.ec2.selectInstance", { instanceId }).then(
          (workspaceResult) => {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
            });
          },
        );
      }}
      onInvokeEC2Action={(action, instanceId) => {
        setEC2ActionStatus(`Queueing EC2 ${action} for ${instanceId}.`);
        setEC2ActionInFlight(true);
        void backendRequest<JobStatus>("aws.ec2.invokeAction", { action, instanceId }).then(
          (job) => {
            setEC2ActionStatus(job.message);
            setEC2ActionInFlight(job.status === "queued" || job.status === "running");
            void pollEC2ActionResult(action, instanceId);
          },
        ).catch((error: unknown) => {
          setEC2ActionStatus(error instanceof Error ? error.message : String(error));
          setEC2ActionInFlight(false);
        });
      }}
      onSelectAzureResourceGroup={(resourceGroup) => {
        void backendRequest<WorkspaceSnapshot>("azure.selectResourceGroup", { resourceGroup }).then(
          (workspaceResult) => {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
            });
          },
        );
      }}
      onSelectAzureVirtualMachine={(vmId) => {
        void backendRequest<WorkspaceSnapshot>("azure.selectVirtualMachine", { vmId }).then(
          (workspaceResult) => {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
            });
          },
        );
      }}
    />
  ) : (
    <SessionSetupView
      providers={providers}
      profiles={profiles}
      session={session}
      selectedProvider={selectedProvider}
      selectedProfile={selectedProfile}
      appSettings={appSettings}
      latestLog={latestLog}
      loading={loading}
      isTablet={isTablet}
      showSensitiveValues={showSensitiveValues}
      providerQuery={providerQuery}
      profileQuery={profileQuery}
      providerPreferences={providerPreferences}
      profilePreferences={profilePreferences}
      onToggleSensitiveValues={() => {
        setShowSensitiveValues((current) => !current);
      }}
      onProviderQueryChange={setProviderQuery}
      onProfileQueryChange={setProfileQuery}
      onProviderPreferencesChange={setProviderPreferences}
      onProfilePreferencesChange={setProfilePreferences}
      onRefreshDiscovery={() => {
        void refreshDiscovery();
      }}
      onSelectProvider={(providerId) => {
        void mutateSession("session.selectProvider", { providerId });
      }}
      onSelectProfile={(providerId, profileId) => {
        void mutateSession("session.selectProfile", { providerId, profileId });
      }}
      onSelectAuthMethod={(authMethod) => {
        void mutateSession("session.selectAuthMethod", { authMethod });
      }}
      onLockSession={() => {
        void mutateSession("session.lock");
      }}
    />
  );

  return (
    <div className="app-shell">
      <div className={`app-frame${sidebarCollapsed ? " app-frame-sidebar-collapsed" : ""}`}>
        <AppSidebar
          session={session}
          selectedProvider={selectedProvider}
          selectedProfile={selectedProfile}
          workspace={workspace}
          activeWorkspaceTabId={activeWorkspaceTabId}
          activeS3PageId={activeS3PageId}
          activeAzurePageId={activeAzurePageId}
          collapsed={sidebarCollapsed}
          activityOpen={splitPanelOpen}
          onToggleCollapsed={() => {
            setSidebarCollapsed((current) => !current);
          }}
          onToggleActivity={() => {
            setSplitPanelOpen((current) => !current);
          }}
          onLockSession={() => {
            void mutateSession("session.lock");
          }}
          onWorkspaceTabChange={setActiveWorkspaceTabId}
          onS3PageChange={setActiveS3PageId}
          onAzurePageChange={setActiveAzurePageId}
          onRefreshDiscovery={() => {
            void refreshDiscovery();
          }}
        />
        <main className="app-main">
          <Flashbar items={notifications} />
          <Suspense
            fallback={
              <Box padding="l" color="text-body-secondary">
                Loading workspace shell...
              </Box>
            }
          >
            {content}
          </Suspense>
          <footer className="app-footer">
            <div>
              <strong>CloudSprocket Desktop</strong>
              <span>Version {appVersion}</span>
            </div>
            <div>
              <span>Copyright © {new Date().getFullYear()} CloudSprocket.</span>
              <span>Local-first cloud workspace.</span>
            </div>
          </footer>
        </main>
        {activityDrawer}
      </div>
    </div>
  );
}
