import {
  Box,
  Flashbar,
  SpaceBetween,
  Button,
  Container,
  Header,
  Input,
  StatusIndicator,
  Modal,
} from "@cloudscape-design/components";
import type { FlashbarProps, PropertyFilterProps } from "@cloudscape-design/components";
import {
  Component,
  Suspense,
  startTransition,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Boxes, Bug, LayoutGrid, Server, Trash2 } from "lucide-react";
import awsEc2IconUrl from "./assets/cloud-icons/aws-ec2.svg";
import awsS3IconUrl from "./assets/cloud-icons/aws-s3.svg";
import azureIconUrl from "./assets/cloud-icons/azure.svg";
import { backendRequest, subscribeToBackendEvent, addDebugLog, clearDebugLogs } from "./lib/backend";
import { AppShell, ConnectionRail, ContextNav, TopBar, ActivityDrawer } from "./components/shell";
import type {
  ActivityEntry,
  NavConnectionHeader,
  NavGroup,
  NavItem,
  RailConnection,
} from "./components/shell/types";
import type { Status } from "./components/status-dot";
import SessionSetupView from "./views/SessionSetupView";
import WorkspaceView from "./views/WorkspaceView";
import type {
  ActivityLogEntry,
  AppResetResult,
  AppSettingsSnapshot,
  AuthMethod,
  AwsEc2Instance,
  AwsS3PresignResult,
  AwsS3UploadResult,
  AwsS3Bucket,
  AwsS3ExportSnippet,
  AwsS3Object,
  AzureResourceGroup,
  AzureVirtualMachine,
  DetailField,
  EmulatorActionResult,
  EmulatorLogSnapshot,
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
  WorkspaceTab,
} from "./types/backend";
import { defaultQuery, type TablePreferences, DebugConsole } from "./views/shared";

type EC2LifecycleAction = "start" | "stop" | "reboot";

type EC2ActionHistoryItem = {
  jobId: string;
  status: JobLifecycle;
  message: string;
  completedAt?: string;
};

class AppErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("React render error", error, info.componentStack);
    addDebugLog({
      timestamp: new Date().toISOString(),
      type: "error",
      method: "react.render",
      payload: {
        message: error.message,
        componentStack: info.componentStack,
      },
    });
  }

  render() {
    if (this.state.error) {
      return (
        <Container
          header={
            <Header
              variant="h1"
              description="The app caught a render error instead of showing a blank screen."
            >
              Application Error
            </Header>
          }
        >
          <SpaceBetween size="s">
            <StatusIndicator type="error">Render failed</StatusIndicator>
            <Box variant="code">{this.state.error.message}</Box>
          </SpaceBetween>
        </Container>
      );
    }

    return this.props.children;
  }
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

function defaultLocalStackSummary(): EmulatorSummary {
  return {
    emulatorId: "localstack",
    providerId: "aws",
    label: "LocalStack",
    kind: "docker",
    status: "not-configured",
    summary: "LocalStack status is not available yet. Start will ask Docker to create the managed container.",
    details: [
      { label: "Image", value: "localstack/localstack:stable" },
      { label: "Endpoint", value: "http://localhost:4566" },
    ],
  };
}

function defaultFlociAzSummary(): EmulatorSummary {
  return {
    emulatorId: "floci-az",
    providerId: "azure",
    label: "floci-az",
    kind: "docker",
    status: "not-configured",
    summary: "floci-az status is not available yet. Start will ask Docker to create the managed container.",
    details: [
      { label: "Image", value: "floci/floci-az:latest" },
      { label: "Endpoint", value: "http://localhost:4577" },
    ],
  };
}

function ensureEmulatorSummaries(emulators: EmulatorSummary[]): EmulatorSummary[] {
  const byId = new Map(emulators.map((emulator) => [emulator.emulatorId, emulator]));
  return [
    byId.get("localstack") ?? defaultLocalStackSummary(),
    byId.get("floci-az") ?? defaultFlociAzSummary(),
    ...emulators.filter((emulator) => emulator.emulatorId !== "localstack" && emulator.emulatorId !== "floci-az"),
  ];
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

function normaliseSessionSnapshot(session: Partial<SessionSnapshot> | null | undefined): SessionSnapshot {
  return {
    ...emptySession,
    ...(session ?? {}),
    isLocked: session?.isLocked ?? false,
    currentProviderId: session?.currentProviderId,
    selectedProfileId: session?.selectedProfileId,
    selectedAuthMethod: session?.selectedAuthMethod,
    availableAuthMethods: normaliseArray(session?.availableAuthMethods),
    lockedProviderId: session?.lockedProviderId,
    lockedProfileId: session?.lockedProfileId,
    lockedAuthMethod: session?.lockedAuthMethod,
    workspaceTabs: normaliseArray(session?.workspaceTabs),
    selectedS3BucketName: session?.selectedS3BucketName,
    selectedS3ObjectKey: session?.selectedS3ObjectKey,
    s3PrefixFilter: session?.s3PrefixFilter ?? "",
    selectedEc2Region: session?.selectedEc2Region,
    selectedEc2InstanceId: session?.selectedEc2InstanceId,
    selectedAzureResourceGroup: session?.selectedAzureResourceGroup,
    selectedAzureVmId: session?.selectedAzureVmId,
  };
}

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
    emulatorSummaries: ensureEmulatorSummaries(normaliseArray(source.emulatorSummaries).map(normaliseEmulatorSummary)),
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
  localStackImage: "",
  flociAzImage: "",
};

const emptyWorkspace: WorkspaceSnapshot = {
  environmentDiagnostics: [],
  dockerDiagnostics: {
    engineState: "unknown",
    summary: "Docker runtime was not detected.",
    details: [],
  },
  dockerRuntime: {
    reachable: false,
    resourceOwnership: {
      labelKey: "",
      labelValue: "",
      projectLabelKey: "",
      projectName: "",
      summary: "",
    },
    summary: "Docker runtime was not detected.",
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
  runtimeSettings: emptySettings,
};

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
  const [ec2ActionStatus, setEC2ActionStatus] = useState("Select an EC2 region before refreshing inventory.");
  const [ec2ActionInFlight, setEC2ActionInFlight] = useState(false);
  const [ec2ActionHistory, setEC2ActionHistory] = useState<EC2ActionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [localStackAuthToken, setLocalStackAuthToken] = useState("");
  const [localStackPersistence, setLocalStackPersistence] = useState(false);
  const [localStackEnvironmentText, setLocalStackEnvironmentText] = useState("");
  const [localStackLogs, setLocalStackLogs] = useState<EmulatorLogSnapshot>({
    emulatorId: "localstack",
    lines: [],
    summary: "LocalStack logs have not been loaded yet.",
  });
  const [localStackLogsStatus, setLocalStackLogsStatus] = useState("");
  const [localStackActionStatus, setLocalStackActionStatus] = useState("No LocalStack action has run yet.");
  const [localStackActionInFlight, setLocalStackActionInFlight] = useState(false);
  const [flociAzPersistence, setFlociAzPersistence] = useState(false);
  const [flociAzEnvironmentText, setFlociAzEnvironmentText] = useState("FLOCI_AZ_SERVICES_FUNCTIONS_ENABLED=false");
  const [flociAzLogs, setFlociAzLogs] = useState<EmulatorLogSnapshot>({
    emulatorId: "floci-az",
    lines: [],
    summary: "floci-az logs have not been loaded yet.",
  });
  const [flociAzLogsStatus, setFlociAzLogsStatus] = useState("");
  const [flociAzActionStatus, setFlociAzActionStatus] = useState("No floci-az action has run yet.");
  const [flociAzActionInFlight, setFlociAzActionInFlight] = useState(false);
  const [activeWorkspaceTabId, setActiveWorkspaceTabId] = useState("overview");
  const [activeS3PageId, setActiveS3PageId] = useState("buckets");
  const [activeAzurePageId, setActiveAzurePageId] = useState("resource-groups");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [splitPanelOpen, setSplitPanelOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetInFlight, setResetInFlight] = useState(false);
  const [showSensitiveValues, setShowSensitiveValues] = useState(false);
  const [providerQuery, setProviderQuery] = useState<PropertyFilterProps.Query>(defaultQuery);
  const [profileQuery, setProfileQuery] = useState<PropertyFilterProps.Query>(defaultQuery);
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
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);

  const isInitialLoad = useRef(true);
  const s3PrefixRequestIdRef = useRef(0);
  const isTablet = viewportWidth < 1180;
  const selectedProvider = providers.find((provider) => provider.providerId === session.currentProviderId);
  const selectedProfile = profiles.find((profile) => profile.profileId === session.selectedProfileId);
  const latestLog = logs[0];

  useEffect(() => {
    // Intercept console
    const originals = {
      log: console.log,
      error: console.error,
      warn: console.warn,
    };

    console.log = (...args) => {
      originals.log(...args);
      addDebugLog({
        timestamp: new Date().toISOString(),
        type: "console",
        payload: { level: "log", args },
      });
    };

    console.error = (...args) => {
      originals.error(...args);
      addDebugLog({
        timestamp: new Date().toISOString(),
        type: "console",
        payload: { level: "error", args },
      });
    };

    console.warn = (...args) => {
      originals.warn(...args);
      addDebugLog({
        timestamp: new Date().toISOString(),
        type: "console",
        payload: { level: "warn", args },
      });
    };

    return () => {
      console.log = originals.log;
      console.error = originals.error;
      console.warn = originals.warn;
    };
  }, []);

  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      void loadState();
    }
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
    const unsubs: (() => void)[] = [];
    void (async () => {
      unsubs.push(
        await subscribeToBackendEvent("state.changed", (payload: StateChangedPayload) => {
          startTransition(() => {
            setProviders(normaliseArray(payload.providers).map(normaliseProvider));
            setProfiles(normaliseArray(payload.profiles).map(normaliseProfile));
            setSession(normaliseSessionSnapshot(payload.session));
          });
        }),
      );
      unsubs.push(
        await subscribeToBackendEvent("log.appended", (entry: ActivityLogEntry) => {
          setLogs((current) => [entry, ...current].slice(0, 500));
        }),
      );
      unsubs.push(
        await subscribeToBackendEvent("job.updated", (job: JobStatus) => {
          if (isWorkspaceSnapshot(job.result)) {
            const workspaceResult = normaliseWorkspaceSnapshot(job.result);
            startTransition(() => {
              setWorkspace(workspaceResult);
            });
          }
          if (job.label.toLowerCase().includes("ec2")) {
            setEC2ActionStatus(job.message);
            setEC2ActionInFlight(job.status === "queued" || job.status === "running");
            setEC2ActionHistory((current) => [
              {
                jobId: job.jobId,
                status: job.status,
                message: job.message,
                completedAt: job.completedAt,
              },
              ...current.filter((entry) => entry.jobId !== job.jobId),
            ].slice(0, 10));
          }
          setNotifications((current) => {
            const existing = current.findIndex((n) => n.id === job.jobId);
            const notification: FlashbarProps.MessageDefinition = {
              id: job.jobId,
              type: job.status === "failed" ? "error" : job.status === "completed" ? "success" : "in-progress",
              header: job.label,
              content: job.message,
              dismissible: job.status === "completed" || job.status === "failed",
              onDismiss: () => setNotifications((prev) => prev.filter((n) => n.id !== job.jobId)),
              loading: job.status === "running" || job.status === "queued",
            };
            if (existing >= 0) {
              const next = [...current];
              next[existing] = notification;
              return next;
            }
            return [notification, ...current];
          });
        }),
      );
    })();
    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, []);

  useEffect(() => {
    if (
      session.isLocked &&
      session.workspaceTabs.length > 0 &&
      activeWorkspaceTabId !== "virtualisation" &&
      activeWorkspaceTabId !== "debug" &&
      !session.workspaceTabs.some((tab) => tab.tabId === activeWorkspaceTabId)
    ) {
      setActiveWorkspaceTabId(session.workspaceTabs[0].tabId);
    }
  }, [activeWorkspaceTabId, session.isLocked, session.workspaceTabs]);

  useEffect(() => {
    if (activeWorkspaceTabId !== "virtualisation") {
      return undefined;
    }
    void refreshVirtualisationState();
    const interval = window.setInterval(() => {
      void refreshVirtualisationState();
    }, 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [activeWorkspaceTabId]);

  async function mutateSession(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      const nextSession = await backendRequest<SessionSnapshot>(method, params);
      const normalisedSession = normaliseSessionSnapshot(nextSession);
      startTransition(() => {
        setSession(normalisedSession);
        if (method === "session.unlock") {
          setActiveWorkspaceTabId("overview");
        }
      });
      await loadWorkspace(normalisedSession);
      await loadState();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Session mutation failed";
      pushNotification("error", `Failed to execute ${method}`, message);
    }
  }

  async function refreshDiscovery(): Promise<void> {
    await backendRequest<JobStatus>("actions.invoke", {
      actionId: "refresh",
    });
  }

  async function resetAppData(): Promise<void> {
    if (resetConfirmation !== "RESET") {
      return;
    }

    setResetInFlight(true);
    try {
      const result = await backendRequest<AppResetResult>("app.reset", {
        confirmation: resetConfirmation,
      });
      clearDebugLogs();
      startTransition(() => {
        setSession(emptySession);
        setWorkspace(emptyWorkspace);
        setLogs([]);
        setS3UploadStatus("Select a bucket and provide a local file path to upload.");
        setS3SignedUrlStatus("Select an object to generate a signed URL.");
        setS3SignedUrlResult(undefined);
        setS3UrlInspection(undefined);
        setS3UrlValidation(undefined);
        setEC2ActionStatus("Select an EC2 region before refreshing inventory.");
        setEC2ActionInFlight(false);
        setEC2ActionHistory([]);
        setLocalStackAuthToken("");
        setLocalStackPersistence(false);
        setLocalStackEnvironmentText("");
        setLocalStackLogs({
          emulatorId: "localstack",
          lines: [],
          summary: "LocalStack logs have not been loaded yet.",
        });
        setLocalStackLogsStatus("");
        setLocalStackActionStatus("No LocalStack action has run yet.");
        setLocalStackActionInFlight(false);
        setFlociAzPersistence(false);
        setFlociAzEnvironmentText("FLOCI_AZ_SERVICES_FUNCTIONS_ENABLED=false");
        setFlociAzLogs({
          emulatorId: "floci-az",
          lines: [],
          summary: "floci-az logs have not been loaded yet.",
        });
        setFlociAzLogsStatus("");
        setFlociAzActionStatus("No floci-az action has run yet.");
        setFlociAzActionInFlight(false);
        setActiveWorkspaceTabId("overview");
        setActiveS3PageId("buckets");
        setActiveAzurePageId("resource-groups");
        setSplitPanelOpen(false);
        setShowSensitiveValues(false);
        setProviderQuery(defaultQuery);
        setProfileQuery(defaultQuery);
      });
      setResetModalOpen(false);
      setResetConfirmation("");
      void loadState().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Provider discovery reload failed after reset";
        pushNotification("warning", "Reset completed, reload failed", message);
      });
      pushNotification("success", "App reset complete", result.summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : "App reset failed";
      pushNotification("error", "Failed to reset app", message);
    } finally {
      setResetInFlight(false);
    }
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

  async function refreshVirtualisationState(): Promise<WorkspaceSnapshot> {
    const [workspaceResult, logResult, flociLogResult] = await Promise.all([
      backendRequest<WorkspaceSnapshot>("workspace.get"),
      backendRequest<EmulatorLogSnapshot>("emulators.logs", { emulatorId: "localstack", tail: 200 }).catch((error) => ({
        emulatorId: "localstack",
        lines: [],
        summary: error instanceof Error ? error.message : "Failed to load LocalStack logs.",
      })),
      backendRequest<EmulatorLogSnapshot>("emulators.logs", { emulatorId: "floci-az", tail: 200 }).catch((error) => ({
        emulatorId: "floci-az",
        lines: [],
        summary: error instanceof Error ? error.message : "Failed to load floci-az logs.",
      })),
    ]);
    const normalised = normaliseWorkspaceSnapshot(workspaceResult);
    startTransition(() => {
      setWorkspace(normalised);
      setLocalStackLogs(normaliseEmulatorLogSnapshot(logResult));
      setFlociAzLogs(normaliseEmulatorLogSnapshot(flociLogResult));
    });
    return normalised;
  }

  async function refreshLocalStackLogs(): Promise<void> {
    setLocalStackLogsStatus("Refreshing LocalStack logs...");
    try {
      const logsResult = await backendRequest<EmulatorLogSnapshot>("emulators.logs", { emulatorId: "localstack", tail: 200 });
      setLocalStackLogs(normaliseEmulatorLogSnapshot(logsResult));
      setLocalStackLogsStatus("");
    } catch (error) {
      setLocalStackLogsStatus(error instanceof Error ? error.message : "Failed to refresh logs.");
    }
  }

  async function refreshFlociAzLogs(): Promise<void> {
    setFlociAzLogsStatus("Refreshing floci-az logs...");
    try {
      const logsResult = await backendRequest<EmulatorLogSnapshot>("emulators.logs", { emulatorId: "floci-az", tail: 200 });
      setFlociAzLogs(normaliseEmulatorLogSnapshot(logsResult));
      setFlociAzLogsStatus("");
    } catch (error) {
      setFlociAzLogsStatus(error instanceof Error ? error.message : "Failed to refresh logs.");
    }
  }

  async function loadState(): Promise<void> {
    setLoading(true);
    try {
      const [providersResult, sessionResult, settingsResult, logsResult] = await Promise.all([
        backendRequest<ProviderSummary[]>("providers.list"),
        backendRequest<SessionSnapshot>("session.get"),
        backendRequest<AppSettingsSnapshot>("app.settings.get"),
        backendRequest<ActivityLogEntry[]>("logs.list", { limit: 500 }),
      ]);

      const normalisedSession = normaliseSessionSnapshot(sessionResult);
      const profilesResult = await backendRequest<ProfileSummary[]>("profiles.list", {
        providerId: normalisedSession.currentProviderId,
      });
      startTransition(() => {
        setProviders(normaliseArray(providersResult).map(normaliseProvider));
        setProfiles(normaliseArray(profilesResult).map(normaliseProfile));
        setSession(normalisedSession);
        setAppSettings(settingsResult);
        setLogs(normaliseArray(logsResult));
      });

      await loadWorkspace(normalisedSession);
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkspace(sessionSnapshot: SessionSnapshot): Promise<void> {
    if (!sessionSnapshot.isLocked) {
      setWorkspace(emptyWorkspace);
      return;
    }
    const workspaceResult = await backendRequest<WorkspaceSnapshot>("workspace.get");
    startTransition(() => {
      setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
    });
  }

  // Re-run discovery and refresh the provider/profile lists without touching the
  // workspace, so a newly created local emulator profile appears in setup
  // without clearing the Local Runtime view.
  async function reloadProvidersAndProfiles(): Promise<void> {
    const [providersResult, sessionResult] = await Promise.all([
      backendRequest<ProviderSummary[]>("providers.list"),
      backendRequest<SessionSnapshot>("session.get"),
    ]);
    const normalisedSession = normaliseSessionSnapshot(sessionResult);
    const profilesResult = await backendRequest<ProfileSummary[]>("profiles.list", {
      providerId: normalisedSession.currentProviderId,
    });
    startTransition(() => {
      setProviders(normaliseArray(providersResult).map(normaliseProvider));
      setProfiles(normaliseArray(profilesResult).map(normaliseProfile));
    });
  }

  function parseEnvironment(text: string, blockedKeys: string[] = []): Record<string, string> {
    const env: Record<string, string> = {};
    const blocked = new Set(blockedKeys);
    text.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return;
      }
      const parts = trimmed.split("=");
      if (parts.length >= 2) {
        const key = parts[0].trim();
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !blocked.has(key)) {
          env[key] = parts.slice(1).join("=").trim();
        }
      }
    });
    return env;
  }

  function localStackEnvironment(): Record<string, string> {
    return parseEnvironment(localStackEnvironmentText, ["LOCALSTACK_AUTH_TOKEN"]);
  }

  function flociAzEnvironment(): Record<string, string> {
    return parseEnvironment(flociAzEnvironmentText);
  }

  function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
    const timeout = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error(errorMessage)), ms);
    });
    return Promise.race([promise, timeout]);
  }

  function pushNotification(type: FlashbarProps.Type, header: string, content: string): void {
    const id = `notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setNotifications((current) => [
      {
        id,
        type,
        header,
        content,
        dismissible: true,
        onDismiss: () => setNotifications((prev) => prev.filter((n) => n.id !== id)),
      },
      ...current,
    ]);
  }

  function addLocalStackNotification(type: FlashbarProps.Type, header: string, content: string): void {
    const id = `ls-action-${Date.now()}`;
    setNotifications((current) => [
      {
        id,
        type,
        header,
        content,
        dismissible: true,
        onDismiss: () => setNotifications((prev) => prev.filter((n) => n.id !== id)),
      },
      ...current,
    ]);
  }

  function addEmulatorNotification(emulatorId: string, type: FlashbarProps.Type, header: string, content: string): void {
    const id = `${emulatorId}-action-${Date.now()}`;
    setNotifications((current) => [
      {
        id,
        type,
        header,
        content,
        dismissible: true,
        onDismiss: () => setNotifications((prev) => prev.filter((n) => n.id !== id)),
      },
      ...current,
    ]);
  }

  function pollLocalStackState(label: string, expectedStatus?: "running" | "stopped"): void {
    let resolved = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      window.setTimeout(() => {
        if (resolved) {
          return;
        }
        void refreshVirtualisationState().then((workspaceSnapshot) => {
          if (resolved) {
            return;
          }
          const localStack = emulatorStatusFromWorkspace(workspaceSnapshot, "localstack");
          if (expectedStatus && localStack?.status === expectedStatus) {
            resolved = true;
            const message = `${label} completed. ${localStack.summary}`;
            setLocalStackActionStatus(message);
            addLocalStackNotification("success", `${label} completed`, localStack.summary);
            return;
          }
          if (!expectedStatus && attempt === 11) {
            resolved = true;
            setLocalStackActionStatus(`${label} completed.`);
          }
        });
      }, (attempt + 1) * 2500);
    }
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
          emulatorId: "localstack",
          authToken: localStackAuthToken,
          persistence: localStackPersistence,
          environment: localStackEnvironment(),
        }
        : { emulatorId: "localstack" };
    const label =
      action === "prepareProfile"
        ? "Prepare LocalStack profile"
        : action === "start"
          ? "Start LocalStack"
          : "Stop LocalStack";
    setLocalStackActionInFlight(true);
    setLocalStackActionStatus(`${label} requested.`);
    try {
      const result = await withTimeout(
        backendRequest<EmulatorActionResult>(method, startParams),
        22000,
        `${label} did not finish within 22 seconds. Check Docker and LocalStack logs, then retry.`,
      );
      const summary = result.summary || `${label} completed.`;
      setLocalStackActionStatus(summary);
      addLocalStackNotification(
        result.state === "failed" ? "error" : result.state === "degraded" ? "warning" : "success",
        result.state === "degraded" ? `${label} needs attention` : `${label} ${result.state}`,
        summary,
      );
      await refreshVirtualisationState();
      await refreshLocalStackLogs();
      if (action === "prepareProfile") {
        await reloadProvidersAndProfiles().catch(() => undefined);
      }
      if (action === "start" || action === "stop") {
        pollLocalStackState(label, action === "start" ? "running" : "stopped");
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : `${label} failed.`;
      const timedOut = rawMessage.includes("did not finish within");
      const message =
        rawMessage === `${label} failed.`
          ? `${label} failed. Docker did not complete the request. Refresh Docker, check the LocalStack logs, then retry.`
          : rawMessage;
      setLocalStackActionStatus(message);
      addLocalStackNotification(timedOut ? "warning" : "error", timedOut ? `${label} still pending` : `${label} failed`, message);
      await refreshVirtualisationState().catch(() => undefined);
      if (timedOut && (action === "start" || action === "stop")) {
        pollLocalStackState(label, action === "start" ? "running" : "stopped");
      }
    } finally {
      setLocalStackActionInFlight(false);
    }
  }

  function pollFlociAzState(label: string, expectedStatus?: "running" | "stopped"): void {
    let resolved = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      window.setTimeout(() => {
        if (resolved) {
          return;
        }
        void refreshVirtualisationState().then((workspaceSnapshot) => {
          if (resolved) {
            return;
          }
          const flociAz = emulatorStatusFromWorkspace(workspaceSnapshot, "floci-az");
          if (expectedStatus && flociAz?.status === expectedStatus) {
            resolved = true;
            const message = `${label} completed. ${flociAz.summary}`;
            setFlociAzActionStatus(message);
            addEmulatorNotification("floci-az", "success", `${label} completed`, flociAz.summary);
            return;
          }
          if (!expectedStatus && attempt === 11) {
            resolved = true;
            setFlociAzActionStatus(`${label} completed.`);
          }
        });
      }, (attempt + 1) * 2500);
    }
  }

  async function invokeFlociAzAction(action: "prepareProfile" | "start" | "stop"): Promise<void> {
    const method =
      action === "prepareProfile"
        ? "emulators.prepareProfile"
        : action === "start"
          ? "emulators.start"
          : "emulators.stop";
    const startParams =
      action === "start"
        ? {
          emulatorId: "floci-az",
          persistence: flociAzPersistence,
          environment: flociAzEnvironment(),
        }
        : { emulatorId: "floci-az" };
    const label =
      action === "prepareProfile"
        ? "Prepare floci-az config"
        : action === "start"
          ? "Start floci-az"
          : "Stop floci-az";
    setFlociAzActionInFlight(true);
    setFlociAzActionStatus(`${label} requested.`);
    try {
      const result = await withTimeout(
        backendRequest<EmulatorActionResult>(method, startParams),
        22000,
        `${label} did not finish within 22 seconds. Check Docker and floci-az logs, then retry.`,
      );
      const summary = result.summary || `${label} completed.`;
      setFlociAzActionStatus(summary);
      addEmulatorNotification(
        "floci-az",
        result.state === "failed" ? "error" : result.state === "degraded" ? "warning" : "success",
        result.state === "degraded" ? `${label} needs attention` : `${label} ${result.state}`,
        summary,
      );
      await refreshVirtualisationState();
      await refreshFlociAzLogs();
      if (action === "prepareProfile") {
        await reloadProvidersAndProfiles().catch(() => undefined);
      }
      if (action === "start" || action === "stop") {
        pollFlociAzState(label, action === "start" ? "running" : "stopped");
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : `${label} failed.`;
      const timedOut = rawMessage.includes("did not finish within");
      const message =
        rawMessage === `${label} failed.`
          ? `${label} failed. Docker did not complete the request. Refresh Docker, check the floci-az logs, then retry.`
          : rawMessage;
      setFlociAzActionStatus(message);
      addEmulatorNotification("floci-az", timedOut ? "warning" : "error", timedOut ? `${label} still pending` : `${label} failed`, message);
      await refreshVirtualisationState().catch(() => undefined);
      if (timedOut && (action === "start" || action === "stop")) {
        pollFlociAzState(label, action === "start" ? "running" : "stopped");
      }
    } finally {
      setFlociAzActionInFlight(false);
    }
  }

  const content = activeWorkspaceTabId === "debug" ? (
    <Container
      header={
        <Header
          variant="h1"
          description="Real-time RPC and application diagnostics."
        >
          Debug Console
        </Header>
      }
    >
      <DebugConsole />
    </Container>
  ) : session.isLocked || activeWorkspaceTabId === "virtualisation" ? (
    <WorkspaceView
      session={session}
      workspace={workspace}
      logs={logs}
      latestLog={logs[0]}
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
      localStackLogs={localStackLogs}
      localStackLogsStatus={localStackLogsStatus}
      localStackActionStatus={localStackActionStatus}
      localStackActionInFlight={localStackActionInFlight}
      flociAzPersistence={flociAzPersistence}
      flociAzEnvironmentText={flociAzEnvironmentText}
      flociAzLogs={flociAzLogs}
      flociAzLogsStatus={flociAzLogsStatus}
      flociAzActionStatus={flociAzActionStatus}
      flociAzActionInFlight={flociAzActionInFlight}
      onFlociAzPersistenceChange={setFlociAzPersistence}
      onFlociAzEnvironmentTextChange={setFlociAzEnvironmentText}
      onRefreshLocalStackLogs={() => {
        void refreshLocalStackLogs();
      }}
      onRefreshFlociAzLogs={() => {
        void refreshFlociAzLogs();
      }}
      onInvokeFlociAzAction={(action) => {
        void invokeFlociAzAction(action);
      }}
      onUnlockSession={() => {
        void mutateSession("session.unlock");
      }}
      onToggleSensitiveValues={() => {
        setShowSensitiveValues((current) => !current);
      }}
      onInvokeWorkspaceAction={(actionId) => {
        void backendRequest("actions.invoke", { actionId });
      }}
      onSelectS3Bucket={(bucketName) => {
        void mutateSession("aws.s3.selectBucket", { bucketName });
      }}
      onSelectS3Object={(objectKey) => {
        void mutateSession("aws.s3.selectObject", { objectKey });
      }}
      onSetS3PrefixFilter={(prefix) => {
        const requestId = s3PrefixRequestIdRef.current + 1;
        s3PrefixRequestIdRef.current = requestId;
        void backendRequest<WorkspaceSnapshot>("aws.s3.setPrefixFilter", { prefix }).then((workspaceResult) => {
          if (requestId === s3PrefixRequestIdRef.current) {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
            });
          }
        });
      }}
      s3UploadStatus={s3UploadStatus}
      s3SignedUrlStatus={s3SignedUrlStatus}
      s3SignedUrlResult={s3SignedUrlResult}
      s3UrlInspection={s3UrlInspection}
      s3UrlValidation={s3UrlValidation}
      onUploadS3Object={(sourcePath, objectKey) => {
        setS3UploadStatus(`Queueing upload for ${objectKey}.`);
        void backendRequest("aws.s3.uploadObject", { objectKey, sourcePath });
      }}
      onPresignS3Object={(durationSeconds) => {
        setS3SignedUrlStatus("Queueing signed URL generation.");
        void backendRequest("aws.s3.presignObject", { durationSeconds });
      }}
      onAnalyseS3Url={(url) => {
        void (async () => {
          setS3UrlInspection(await backendRequest<UrlInspection>("aws.s3.analyseUrl", { url }));
        })();
      }}
      onValidateS3Url={(url) => {
        void (async () => {
          await backendRequest("aws.s3.validateUrl", { url });
        })();
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
        void backendRequest<WorkspaceSnapshot>("aws.ec2.selectRegion", { region })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
            });
            setEC2ActionStatus(workspaceResult.ec2StatusMessage || `Loaded EC2 instances from ${region}.`);
          })
          .catch((error: unknown) => {
            setEC2ActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
      onSelectEC2Region={(region) => {
        setEC2ActionStatus("Select an instance to run lifecycle actions.");
        setEC2ActionInFlight(false);
        void backendRequest<WorkspaceSnapshot>("aws.ec2.selectRegion", { region }).then((workspaceResult) => {
          startTransition(() => {
            setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
          });
        });
      }}
      onSelectEC2Instance={(instanceId) => {
        setEC2ActionStatus("Instance selected. EC2 lifecycle writes require a local endpoint profile with write opt-in.");
        setEC2ActionInFlight(false);
        void backendRequest<WorkspaceSnapshot>("aws.ec2.selectInstance", { instanceId }).then((workspaceResult) => {
          startTransition(() => {
            setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
          });
        });
      }}
      onInvokeEC2Action={(action, instanceId) => {
        setEC2ActionStatus(`Queueing EC2 ${action} for ${instanceId}.`);
        setEC2ActionInFlight(true);
        void backendRequest<JobStatus>("aws.ec2.invokeAction", { action, instanceId })
          .then((job) => {
            setEC2ActionStatus(job.message);
            setEC2ActionInFlight(job.status === "queued" || job.status === "running");
          })
          .catch((error: unknown) => {
            setEC2ActionStatus(error instanceof Error ? error.message : String(error));
            setEC2ActionInFlight(false);
          });
      }}
      onSelectAzureResourceGroup={(resourceGroup) => {
        void mutateSession("azure.selectResourceGroup", { resourceGroup });
      }}
      onSelectAzureVirtualMachine={(vmId) => {
        void mutateSession("azure.selectVirtualMachine", { vmId });
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

  const resetModal = (
    <Modal
      visible={resetModalOpen}
      header="Reset app data"
      onDismiss={() => {
        if (!resetInFlight) {
          setResetModalOpen(false);
          setResetConfirmation("");
        }
      }}
      footer={
        <SpaceBetween
          direction="horizontal"
          size="xs"
        >
          <Button
            variant="link"
            disabled={resetInFlight}
            onClick={() => {
              setResetModalOpen(false);
              setResetConfirmation("");
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={resetInFlight}
            disabled={resetConfirmation !== "RESET"}
            onClick={() => {
              void resetAppData();
            }}
          >
            Reset app
          </Button>
        </SpaceBetween>
      }
    >
      <SpaceBetween size="m">
        <Box>
          This clears CloudSprocket session state, activity logs, cached inventory, debug logs, and app-managed local runtime files. It does not touch AWS, Azure, or GCP config files outside the CloudSprocket app data folder.
        </Box>
        <Input
          value={resetConfirmation}
          placeholder="RESET"
          ariaLabel="Reset confirmation"
          disabled={resetInFlight}
          onChange={({ detail }) => {
            setResetConfirmation(detail.value);
          }}
        />
      </SpaceBetween>
    </Modal>
  );

  // ---- Shell view-model derived from live state ----
  const lockedProfile = profiles.find((profile) => profile.profileId === session.lockedProfileId);
  const activeProvider = selectedProvider ?? workspace.provider;
  const emulatorCount = workspace.emulatorSummaries.length;
  const dockerReachable = workspace.dockerRuntime.reachable;
  const isLocalActive = activeWorkspaceTabId === "virtualisation";
  const activeConnectionId = isLocalActive ? "local" : session.currentProviderId ?? null;

  const railConnections: RailConnection[] = [
    ...providers.map((provider) => ({
      id: provider.providerId,
      label: provider.profileCount
        ? `${provider.label} · ${provider.profileCount} profile${provider.profileCount === 1 ? "" : "s"}`
        : provider.label,
      provider: provider.providerId,
      status: providerStatus(provider),
      kind: "provider" as const,
    })),
    {
      id: "local",
      label: "Local Runtime",
      status: (dockerReachable ? "on" : "off") as Status,
      kind: "local" as const,
    },
  ];

  const navConnection: NavConnectionHeader = isLocalActive
    ? {
        name: "Local Runtime",
        meta: `Docker · ${emulatorCount} emulator${emulatorCount === 1 ? "" : "s"}`,
        status: dockerReachable ? "on" : "off",
        statusText: dockerReachable ? "Docker engine running" : "Docker engine not detected",
      }
    : {
        name: activeProvider?.label ?? "Getting started",
        meta: session.isLocked
          ? [
              (lockedProfile ?? selectedProfile)?.displayName,
              authLabel(session.lockedAuthMethod ?? session.selectedAuthMethod),
            ]
              .filter(Boolean)
              .join(" · ") || "Workspace open"
          : selectedProfile?.displayName ?? "Pick a profile to begin",
        provider: activeProvider?.providerId,
        status: activeProvider ? providerStatus(activeProvider) : "off",
        statusText: session.isLocked
          ? "Workspace open"
          : activeProvider?.summary ?? "Choose a connection to start",
      };

  function buildNavGroups(): NavGroup[] {
    if (isLocalActive) {
      return [
        {
          label: "Runtime",
          items: [
            { id: "virtualisation", label: "Emulators", icon: Server, count: emulatorCount },
            { id: "debug", label: "Debug console", icon: Bug },
          ],
        },
      ];
    }
    if (!session.isLocked) {
      return [
        { label: "Set up", items: [{ id: "overview", label: "Overview", icon: LayoutGrid }] },
        { label: "Tools", items: [{ id: "debug", label: "Debug console", icon: Bug }] },
      ];
    }
    const groups: NavGroup[] = [
      {
        label: "Workspace",
        items: session.workspaceTabs.map((tab) => navItemForTab(tab, workspace)),
      },
    ];
    if (activeWorkspaceTabId === "s3") {
      groups.push({
        label: "Storage",
        items: [
          { id: "s3:buckets", label: "Buckets" },
          { id: "s3:objects", label: "Objects" },
          { id: "s3:upload", label: "Upload" },
          { id: "s3:inspect", label: "Inspect URL" },
        ],
      });
    }
    groups.push({ label: "Tools", items: [{ id: "debug", label: "Debug console", icon: Bug }] });
    return groups;
  }

  const navGroups = buildNavGroups();
  const activeNavItemId =
    activeWorkspaceTabId === "s3" ? `s3:${activeS3PageId}` : activeWorkspaceTabId;
  const viewLabel = viewLabelFor(activeWorkspaceTabId, session.workspaceTabs);
  const activityEntries = toActivityEntries(logs);

  function handleRailSelect(id: string): void {
    if (id === "local") {
      setActiveWorkspaceTabId("virtualisation");
      return;
    }
    if (id !== session.currentProviderId) {
      void mutateSession("session.selectProvider", { providerId: id });
    }
    setActiveWorkspaceTabId("overview");
  }

  function handleNavSelect(id: string): void {
    const separator = id.indexOf(":");
    if (separator >= 0) {
      const tabId = id.slice(0, separator);
      const pageId = id.slice(separator + 1);
      setActiveWorkspaceTabId(tabId);
      if (tabId === "s3") {
        setActiveS3PageId(pageId);
      } else if (tabId === "azure-overview") {
        setActiveAzurePageId(pageId);
      }
      return;
    }
    setActiveWorkspaceTabId(id);
    if (id === "azure-overview") {
      setActiveAzurePageId("overview");
    }
  }

  return (
    <>
      {resetModal}
      <AppShell
        navCollapsed={sidebarCollapsed || isTablet}
        rail={
          <ConnectionRail
            connections={railConnections}
            activeId={activeConnectionId}
            onSelect={handleRailSelect}
            userInitials="AS"
          />
        }
        nav={
          <ContextNav
            connection={navConnection}
            groups={navGroups}
            activeItemId={activeNavItemId}
            onSelectItem={handleNavSelect}
            onShowActivity={() => {
              setSplitPanelOpen(true);
            }}
            activityActive={splitPanelOpen}
            footer={
              <button
                type="button"
                onClick={() => {
                  setResetModalOpen(true);
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-[18px]" />
                <span className="truncate">Reset app data</span>
              </button>
            }
          />
        }
        topBar={
          <TopBar
            breadcrumb={{ connection: navConnection.name, view: viewLabel }}
            onToggleNav={() => {
              setSidebarCollapsed((current) => !current);
            }}
            onRefresh={() => {
              void refreshDiscovery();
            }}
            onToggleNotifications={() => {
              setSplitPanelOpen((current) => !current);
            }}
            notificationCount={notifications.length}
          />
        }
        drawer={
          <ActivityDrawer
            open={splitPanelOpen}
            onOpenChange={setSplitPanelOpen}
            title="Recent activity"
            subtitle={session.isLocked ? "Workspace" : "Discovery"}
            entries={activityEntries}
          />
        }
      >
        <div className="p-6">
          {notifications.length > 0 ? (
            <div className="mb-4">
              <Flashbar items={notifications} />
            </div>
          ) : null}
          <AppErrorBoundary>
            <Suspense
              fallback={
                <Box padding="l" color="text-body-secondary">
                  Loading workspace shell...
                </Box>
              }
            >
              {content}
            </Suspense>
          </AppErrorBoundary>
        </div>
      </AppShell>
    </>
  );
}

function providerStatus(provider: ProviderSummary): Status {
  switch (provider.state) {
    case "configured":
      return "on";
    case "tooling-only":
      return "warning";
    default:
      return "off";
  }
}

function authLabel(method?: AuthMethod): string | undefined {
  if (method === "cli") {
    return "CLI";
  }
  if (method === "sso") {
    return "SSO";
  }
  if (method === "local-files") {
    return "Local files";
  }
  return undefined;
}

function viewLabelFor(tabId: string, tabs: WorkspaceTab[]): string {
  const labels: Record<string, string> = {
    overview: "Overview",
    virtualisation: "Local Runtime",
    debug: "Debug console",
    s3: "Storage",
    ec2: "Compute",
    "azure-overview": "Azure",
    "azure-resource-groups": "Resource groups",
    "azure-vms": "Virtual machines",
    actions: "Activity",
  };
  return labels[tabId] ?? tabs.find((tab) => tab.tabId === tabId)?.label ?? "Workspace";
}

function navItemForTab(tab: WorkspaceTab, workspace: WorkspaceSnapshot): NavItem {
  const base: NavItem = { id: tab.tabId, label: tab.label };
  switch (tab.tabId) {
    case "overview":
      return { ...base, icon: LayoutGrid };
    case "s3":
      return { ...base, iconUrl: awsS3IconUrl, count: workspace.s3Buckets.length };
    case "ec2":
      return { ...base, iconUrl: awsEc2IconUrl, count: workspace.ec2Instances.length };
    case "azure-overview":
    case "azure-resource-groups":
      return { ...base, iconUrl: azureIconUrl, count: workspace.azureResourceGroups.length };
    case "azure-vms":
      return { ...base, iconUrl: azureIconUrl, count: workspace.azureVirtualMachines.length };
    case "actions":
      return { ...base, icon: Boxes };
    case "virtualisation":
      return { ...base, icon: Server, count: workspace.emulatorSummaries.length };
    case "debug":
      return { ...base, icon: Bug };
    default:
      return { ...base, icon: Boxes };
  }
}

const LOG_TONE: Record<string, Status> = {
  error: "error",
  warn: "warning",
  warning: "warning",
  success: "on",
  info: "off",
  debug: "off",
};

function logTone(level: string): Status {
  return LOG_TONE[level?.toLowerCase?.() ?? ""] ?? "off";
}

function formatLogTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleTimeString("en-GB");
}

function toActivityEntries(logs: ActivityLogEntry[]): ActivityEntry[] {
  return logs.map((entry) => ({
    id: entry.id,
    timestamp: formatLogTime(entry.timestamp),
    message: entry.message,
    detail: entry.details,
    tone: logTone(entry.level),
  }));
}

function dockerDiagnosticsFromRuntime(runtime: DockerRuntimeSnapshot): WorkspaceSnapshot["dockerDiagnostics"] {
  return {
    engineState: runtime.reachable ? "available" : runtime.host ? "unavailable" : "unknown",
    summary: runtime.summary,
    details: runtime.details,
    contextName: runtime.contextName,
    host: runtime.host,
  };
}

function normaliseEmulatorLogSnapshot(snapshot: Partial<EmulatorLogSnapshot> | null | undefined): EmulatorLogSnapshot {
  return {
    emulatorId: snapshot?.emulatorId ?? "localstack",
    lines: normaliseArray(snapshot?.lines).map((line) => String(line)),
    summary: snapshot?.summary ?? "Emulator logs have not been loaded yet.",
  };
}

function emulatorStatusFromWorkspace(workspace: WorkspaceSnapshot, emulatorId: string): EmulatorSummary | undefined {
  return workspace.emulatorSummaries.find((e) => e.emulatorId === emulatorId);
}
