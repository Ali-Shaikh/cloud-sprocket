// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import {
  Component,
  Suspense,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ErrorInfo, ReactNode } from "react";
import {
  ArrowLeftRight,
  Bug,
  LayoutGrid,
  Rocket,
  Server,
  TriangleAlert,
} from "lucide-react";
import { Toaster } from "sonner";
import { backendRequest, subscribeToBackendEvent, addDebugLog, clearDebugLogs } from "./lib/backend";
import { awsInventoryLoaded, awsInventoryScopeForTab } from "./lib/aws-inventory";
import { azureInventoryLoaded, azureInventoryScopeForTab } from "./lib/azure-inventory";
import { notify, notifyJob, useNotifications, type NotificationTone } from "./lib/notify";
import { useTheme } from "./lib/theme";
import {
  AppShell,
  ConnectionRail,
  ContextNav,
  TopBar,
  ActivityDrawer,
  NotificationCenter,
} from "./components/shell";
import type {
  ActivityEntry,
  NavConnectionHeader,
  NavGroup,
  NavItem,
  RailConnection,
} from "./components/shell/types";
import type { Status } from "./components/status-dot";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./components/ui/alert-dialog";
import ConnectView from "./views/ConnectView";
import OverviewView from "./views/OverviewView";
import { AzureCLIExtensionsBanner } from "./components/azure-cli-extensions-banner";
import DeployView from "./views/DeployView";
import { CommandPalette, type Command } from "./components/command-palette";
import { InventoryLoadingState } from "./components/inventory-loading-state";
import { WorkspaceSkeleton } from "./components/workspace-skeleton";
import DebugView from "./views/DebugView";
import {
  ActivityView,
  AzureAppServiceView,
  AzureCosmosView,
  AzurePostgresView,
  AzureEntraView,
  AzureFrontDoorView,
  AzureFunctionsView,
  AzureKeyVaultView,
  AzureQueuesView,
  AzureStorageView,
  AzureView,
  AzureWafView,
  ComputeView,
  DynamoDBView,
  IAMView,
  LambdaView,
  LogAnalyticsView,
  ToolsHubView,
  LogsView,
  PlaceholderView,
  RDSView,
  RuntimeView,
  SNSView,
  SQSView,
  StorageView,
} from "./views/workspace/lazy-views";
import type {
  ActivityLogEntry,
  AppResetResult,
  AppSettingsSnapshot,
  AuthMethod,
  AuthMethodStatus,
  AwsDynamoDBTable,
  AwsEc2Instance,
  AwsLambdaCreateInput,
  AwsLambdaFunction,
  AwsLambdaInvokeResult,
  AwsSqsPeekResult,
  AwsSqsQueue,
  AwsSnsTopic,
  AwsRdsInstance,
  AwsLogGroup,
  AwsIamRole,
  AwsIamPolicy,
  AwsS3PresignResult,
  AwsS3UploadResult,
  AwsS3Bucket,
  AwsS3ExportSnippet,
  AwsS3Object,
  AzureBastionConnectResult,
  AzureBastionHost,
  AzureBlob,
  AzureBlobContainer,
  AzureResourceGroup,
  AzureStorageAccount,
  AzureVirtualMachine,
  AzureWebApp,
  AzureAppServicePlan,
  AzureWebAppSetting,
  AzureLogAnalyticsHistoryEntry,
  AzureLogAnalyticsSavedQuery,
  AzureLogAnalyticsSelectionResult,
  AzureLogAnalyticsTableInfo,
  AzureLogQueryResult,
  AzureWafLogSchemaProfile,
  AzureFunctionInvokeResult,
  DetailField,
  EmulatorActionResult,
  EmulatorLogSnapshot,
  DockerRuntimeSnapshot,
  RuntimeSnapshot,
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
        <div className="mx-auto max-w-2xl space-y-3 rounded-xl border border-destructive/30 bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <TriangleAlert className="size-5 text-destructive" />
            <h1 className="text-lg font-bold">Application Error</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            The app caught a render error instead of showing a blank screen.
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 font-mono text-xs">
            {this.state.error.message}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
import {
  emptySession,
  emptySettings,
  emptyWorkspace,
  NON_INVENTORY_TABS,
  isS3PresignResult,
  isWorkspaceSnapshot,
  normaliseArray,
  normaliseProvider,
  normaliseProfile,
  normaliseSessionSnapshot,
  normaliseWorkspaceSnapshot,
  mergeAzureResourceGroupSelection,
  mergeAzureStorageSelection,
  mergeAzureFunctionsSelection,
  mergeAzureKeyVaultSelection,
  mergeAzureCosmosSelection,
  mergeAzurePostgresSelection,
  mergeAzureFrontDoorSelection,
  mergeAzureWafSelection,
  mergeAzureQueuesSelection,
  mergeAwsS3Selection,
  mergeAzureInventoryScope,
  mergeAwsInventoryScope,
  applySessionWriteModeToWorkspace,
  formatBackendError,
  frontDoorTopologyLoaded,
} from "./lib/workspace-snapshot";
import {
  profileInitials,
  providerStatus,
  authLabel,
  viewLabelFor,
  navItemForTab,
  toActivityEntries,
  dockerDiagnosticsFromRuntime,
  normaliseEmulatorLogSnapshot,
  emulatorStatusFromWorkspace,
} from "./lib/workspace-shell";

export default function App() {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [session, setSession] = useState<SessionSnapshot>(emptySession);
  const [appSettings, setAppSettings] = useState<AppSettingsSnapshot>(emptySettings);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot>(emptyWorkspace);
  const [azureLogWorkspaceSelectionLoading, setAzureLogWorkspaceSelectionLoading] = useState(false);
  const azureLogWorkspaceSelectionRequest = useRef(0);
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [s3UploadStatus, setS3UploadStatus] = useState("Select a bucket and provide a local file path to upload.");
  const [s3SignedUrlStatus, setS3SignedUrlStatus] = useState("Select an object to generate a signed URL.");
  const [s3SignedUrlResult, setS3SignedUrlResult] = useState<AwsS3PresignResult>();
  const [s3UrlInspection, setS3UrlInspection] = useState<UrlInspection>();
  const [s3UrlValidation, setS3UrlValidation] = useState<UrlValidationResult>();
  const [ec2ActionStatus, setEC2ActionStatus] = useState("Select an EC2 region before refreshing inventory.");
  const [ec2ActionInFlight, setEC2ActionInFlight] = useState(false);
  const [ec2ActionHistory, setEC2ActionHistory] = useState<EC2ActionHistoryItem[]>([]);

  const [lambdaActionStatus, setLambdaActionStatus] = useState("Select a region before refreshing Lambda functions.");
  const [lambdaInvokeResult, setLambdaInvokeResult] = useState<AwsLambdaInvokeResult | null>(null);
  const [lambdaInvokeInFlight, setLambdaInvokeInFlight] = useState(false);
  const [lambdaCreateInFlight, setLambdaCreateInFlight] = useState(false);
  const [lambdaCreateFormOpen, setLambdaCreateFormOpen] = useState(false);
  const [dynamodbActionStatus, setDynamodbActionStatus] = useState(
    "Select a region before refreshing DynamoDB tables.",
  );
  const [sqsActionStatus, setSqsActionStatus] = useState(
    "Select a region before refreshing SQS queues.",
  );
  const [sqsPeekResult, setSqsPeekResult] = useState<AwsSqsPeekResult | null>(null);
  const [sqsPeekInFlight, setSqsPeekInFlight] = useState(false);
  const [snsActionStatus, setSnsActionStatus] = useState(
    "Select a region before refreshing SNS topics.",
  );
  const [rdsActionStatus, setRdsActionStatus] = useState(
    "Select a region before refreshing RDS instances.",
  );
  const [logsActionStatus, setLogsActionStatus] = useState(
    "Select a region before refreshing log groups.",
  );
  const [iamActionStatus, setIamActionStatus] = useState(
    "IAM inventory loads account-wide roles and policies.",
  );
  const [azureActionStatus, setAzureActionStatus] = useState("");
  const [azureStorageActionStatus, setAzureStorageActionStatus] = useState("");
  const [azureAppServiceActionStatus, setAzureAppServiceActionStatus] = useState("");
  const [azureFrontDoorActionStatus, setAzureFrontDoorActionStatus] = useState("");
  const [azureFrontDoorTopologyLoading, setAzureFrontDoorTopologyLoading] = useState(false);
  const [azureWafConfigLoading, setAzureWafConfigLoading] = useState(false);
  const frontDoorRefreshInFlightRef = useRef(false);
  const wafRefreshInFlightRef = useRef(false);
  const azureInventoryFetchedScopesRef = useRef(new Set<string>());
  const awsInventoryFetchedScopesRef = useRef(new Set<string>());
  const [azureInventoryRefreshToken, setAzureInventoryRefreshToken] = useState(0);
  const [awsInventoryRefreshToken, setAwsInventoryRefreshToken] = useState(0);
  const discoveryRefreshJobIdRef = useRef<string | undefined>(undefined);
  const sessionSnapshotRef = useRef(session);
  const loadWorkspaceRef = useRef<(snapshot: SessionSnapshot) => Promise<void>>(async () => undefined);
  const [writeModeDialogOpen, setWriteModeDialogOpen] = useState(false);
  const [writeModeDialogIntent, setWriteModeDialogIntent] = useState<"enable" | "incapable">("enable");
  const [writeModePending, setWriteModePending] = useState(false);
  const writeModeRequestRef = useRef(0);
  const [loading, setLoading] = useState(true);
  // workspaceLoading: an inventory fetch (workspace.get / discovery refresh) is
  // in flight. workspaceLoaded: at least one fetch has completed for the current
  // lock, so zero counts are real rather than "not fetched yet".
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [workspaceFetching, setWorkspaceFetching] = useState(false);
  const workspaceFetchDepthRef = useRef(0);
  const [azureInventoryLoading, setAzureInventoryLoading] = useState(false);
  const [awsInventoryLoading, setAwsInventoryLoading] = useState(false);
  const azureInventoryFetchDepthRef = useRef(0);
  const awsInventoryFetchDepthRef = useRef(0);

  function beginAzureInventoryFetch(): void {
    azureInventoryFetchDepthRef.current += 1;
    if (azureInventoryFetchDepthRef.current === 1) {
      setAzureInventoryLoading(true);
    }
  }

  function endAzureInventoryFetch(): void {
    azureInventoryFetchDepthRef.current = Math.max(0, azureInventoryFetchDepthRef.current - 1);
    if (azureInventoryFetchDepthRef.current === 0) {
      setAzureInventoryLoading(false);
    }
  }

  function beginAwsInventoryFetch(): void {
    awsInventoryFetchDepthRef.current += 1;
    if (awsInventoryFetchDepthRef.current === 1) {
      setAwsInventoryLoading(true);
    }
  }

  function endAwsInventoryFetch(): void {
    awsInventoryFetchDepthRef.current = Math.max(0, awsInventoryFetchDepthRef.current - 1);
    if (awsInventoryFetchDepthRef.current === 0) {
      setAwsInventoryLoading(false);
    }
  }

  function beginWorkspaceFetch(): void {
    workspaceFetchDepthRef.current += 1;
    if (workspaceFetchDepthRef.current === 1) {
      setWorkspaceFetching(true);
      setWorkspaceLoading(true);
    }
  }

  function endWorkspaceFetch(): void {
    workspaceFetchDepthRef.current = Math.max(0, workspaceFetchDepthRef.current - 1);
    if (workspaceFetchDepthRef.current === 0) {
      setWorkspaceFetching(false);
      setWorkspaceLoading(false);
    }
  }

  function resetWorkspaceFetch(): void {
    workspaceFetchDepthRef.current = 0;
    setWorkspaceFetching(false);
    setWorkspaceLoading(false);
  }
  const [openingProfileId, setOpeningProfileId] = useState<string>();
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
  const [frontDoorAccessPrefill, setFrontDoorAccessPrefill] = useState<{
    trackingReference: string;
    workspace?: string;
    timespan?: string;
  } | null>(null);
  const [logAnalyticsPrefill, setLogAnalyticsPrefill] = useState<{
    query?: string;
    timespan?: string;
  } | null>(null);
  const [activeS3PageId, setActiveS3PageId] = useState("buckets");
  const [activeAzurePageId, setActiveAzurePageId] = useState("resource-groups");
  const [activeAzureStoragePageId, setActiveAzureStoragePageId] = useState("blobs");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [splitPanelOpen, setSplitPanelOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetInFlight, setResetInFlight] = useState(false);
  const [showSensitiveValues, setShowSensitiveValues] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const { resolvedTheme } = useTheme();
  const notifications = useNotifications();

  const isInitialLoad = useRef(true);
  const s3PrefixRequestIdRef = useRef(0);
  const isTablet = viewportWidth < 1180;
  const selectedProvider = providers.find((provider) => provider.providerId === session.currentProviderId);
  const selectedProfile = profiles.find((profile) => profile.profileId === session.selectedProfileId);

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
          const isDiscoveryRefresh =
            job.label === "Refresh Discovery" ||
            job.jobId === discoveryRefreshJobIdRef.current;

          if (isWorkspaceSnapshot(job.result)) {
            const workspaceResult = normaliseWorkspaceSnapshot(job.result);
            startTransition(() => {
              setWorkspace(workspaceResult);
              setWorkspaceLoaded(true);
            });
            resetWorkspaceFetch();
            if (isDiscoveryRefresh) {
              discoveryRefreshJobIdRef.current = undefined;
              azureInventoryFetchedScopesRef.current.clear();
              awsInventoryFetchedScopesRef.current.clear();
              setAzureInventoryRefreshToken((token) => token + 1);
              setAwsInventoryRefreshToken((token) => token + 1);
            }
          } else if (
            isDiscoveryRefresh &&
            (job.status === "completed" || job.status === "failed")
          ) {
            discoveryRefreshJobIdRef.current = undefined;
            if (job.status === "failed") {
              resetWorkspaceFetch();
            } else if (sessionSnapshotRef.current.isLocked) {
              resetWorkspaceFetch();
              azureInventoryFetchedScopesRef.current.clear();
              awsInventoryFetchedScopesRef.current.clear();
              setAzureInventoryRefreshToken((token) => token + 1);
              setAwsInventoryRefreshToken((token) => token + 1);
              void loadWorkspaceRef.current(sessionSnapshotRef.current);
            } else {
              resetWorkspaceFetch();
            }
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
          if (isS3PresignResult(job.result)) {
            setS3SignedUrlResult(job.result);
          }
          if (job.label.toLowerCase().includes("signed url")) {
            setS3SignedUrlStatus(job.message);
          }
          notifyJob(job);
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
      activeWorkspaceTabId !== "deploy" &&
      !session.workspaceTabs.some((tab) => tab.tabId === activeWorkspaceTabId)
    ) {
      setActiveWorkspaceTabId(session.workspaceTabs[0].tabId);
    }
  }, [activeWorkspaceTabId, session.isLocked, session.workspaceTabs]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
          azureInventoryFetchedScopesRef.current.clear();
          awsInventoryFetchedScopesRef.current.clear();
          setActiveWorkspaceTabId("overview");
          setLambdaInvokeResult(null);
          setLambdaInvokeInFlight(false);
          setLambdaCreateInFlight(false);
          setLambdaCreateFormOpen(false);
          setLambdaActionStatus("Select a region before refreshing Lambda functions.");
        }
      });
      await loadWorkspace(normalisedSession);
      await loadState({ refreshWorkspace: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Session mutation failed";
      pushNotification("error", `Failed to execute ${method}`, message);
    }
  }

  // Computes the auth methods a profile can actually open with from a session
  // snapshot (those marked available). The orchestration uses this to decide
  // between one-click open, a chip choice, or the disabled-methods state.
  function usableAuthMethods(snapshot: SessionSnapshot): AuthMethodStatus[] {
    return snapshot.availableAuthMethods.filter((method) => method.available);
  }

  // Selects an auth method and locks the session in one chain. Inventory is
  // refreshed once in the background so slow cloud APIs do not hold the user on
  // the Connect screen. Used by both the one-click path and auth-chip choice.
  async function chooseAuthAndOpen(authMethod: string): Promise<void> {
    await backendRequest<SessionSnapshot>("session.selectAuthMethod", { authMethod });
    const lockedSnapshot = normaliseSessionSnapshot(
      await backendRequest<SessionSnapshot>("session.lock"),
    );
    startTransition(() => {
      setSession(lockedSnapshot);
    });
    await loadState();
  }

  // One-click open: pick the profile, then decide based on the returned usable
  // auth methods. Exactly one usable path opens the workspace straight away;
  // more than one shows the auth chips on Connect; zero leaves the disabled
  // methods visible. Any failure surfaces a toast and stays on Connect.
  async function openWorkspace(providerId: string, profileId: string): Promise<void> {
    setOpeningProfileId(profileId);
    try {
      const profileSnapshot = normaliseSessionSnapshot(
        await backendRequest<SessionSnapshot>("session.selectProfile", { providerId, profileId }),
      );
      const usable = usableAuthMethods(profileSnapshot);
      const cliMissing = profileSnapshot.availableAuthMethods.some(
        (method) => method.method === "cli" && !method.available,
      );
      const onlyLocalFilesWithoutCLI =
        usable.length === 1 && usable[0].method === "local-files" && cliMissing;
      if (usable.length === 1 && !onlyLocalFilesWithoutCLI) {
        await chooseAuthAndOpen(usable[0].method);
        return;
      }
      // More than one usable path, or none: surface the profile snapshot so the
      // Connect view can show the chips (multi) or the disabled methods (zero).
      startTransition(() => {
        setSession(profileSnapshot);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open the workspace.";
      pushNotification("error", "Could not open the workspace", message);
    } finally {
      setOpeningProfileId(undefined);
    }
  }

  // Completes the open when the user picks an auth path from the Connect chips
  // (the multi-usable case). Mirrors openWorkspace's single state apply.
  async function chooseAuthMethod(authMethod: string): Promise<void> {
    setOpeningProfileId(session.selectedProfileId);
    try {
      await chooseAuthAndOpen(authMethod);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open the workspace.";
      pushNotification("error", "Could not open the workspace", message);
    } finally {
      setOpeningProfileId(undefined);
    }
  }

  // S3 and Azure selection methods return a WorkspaceSnapshot, not a
  // SessionSnapshot. Routing them through mutateSession misread the response,
  // briefly marked the session unlocked, wiped the workspace, and reloaded all
  // state, so the whole view flickered on every selection change.
  type WorkspaceSelectionOptions = {
    panelLoading?: boolean;
    persistOnly?: boolean;
    merge?: (current: WorkspaceSnapshot, incoming: WorkspaceSnapshot) => WorkspaceSnapshot;
    onOptimistic?: () => void;
    errorTitle?: string;
  };

  async function mutateWorkspaceSelection(
    method: string,
    params: Record<string, unknown> = {},
    options: WorkspaceSelectionOptions = {},
  ): Promise<void> {
    const { panelLoading = false, persistOnly = false, merge, onOptimistic, errorTitle } = options;
    if (onOptimistic) {
      startTransition(onOptimistic);
    }
    if (panelLoading) {
      beginAzureInventoryFetch();
    }
    try {
      const workspaceResult = await backendRequest<WorkspaceSnapshot>(method, params);
      if (!persistOnly) {
        startTransition(() => {
          setWorkspace((current) =>
            merge ? merge(current, workspaceResult) : normaliseWorkspaceSnapshot(workspaceResult),
          );
        });
      }
    } catch (error) {
      pushNotification(
        "error",
        errorTitle ?? `Failed to execute ${method}`,
        formatBackendError(error),
      );
    } finally {
      if (panelLoading) {
        endAzureInventoryFetch();
      }
    }
  }

  async function selectAzureWebAppSlot(slot: string): Promise<void> {
    beginAzureInventoryFetch();
    startTransition(() => {
      setSession((current) =>
        normaliseSessionSnapshot({
          ...current,
          selectedAzureWebAppSlot: slot,
        }),
      );
      setWorkspace((current) =>
        normaliseWorkspaceSnapshot({
          ...current,
          selectedAzureWebAppSlot: slot,
        }),
      );
    });
    try {
      const workspaceResult = await backendRequest<WorkspaceSnapshot>("azure.webApps.selectSlot", {
        slot,
      });
      startTransition(() => {
        setWorkspace((current) => mergeAzureResourceGroupSelection(current, workspaceResult));
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Deployment slot selection failed";
      pushNotification("error", "Could not select deployment slot", message);
    } finally {
      endAzureInventoryFetch();
    }
  }

  async function selectAzureWebApp(appName: string): Promise<void> {
    const trimmed = appName.trim();
    if (!trimmed) {
      return;
    }
    beginAzureInventoryFetch();
    startTransition(() => {
      setSession((current) =>
        normaliseSessionSnapshot({
          ...current,
          selectedAzureWebAppName: trimmed,
          selectedAzureWebAppSlot: undefined,
        }),
      );
      setWorkspace((current) =>
        normaliseWorkspaceSnapshot({
          ...current,
          selectedAzureWebAppName: trimmed,
          selectedAzureWebAppSlot: undefined,
          azureWebAppDeploymentSlots: [],
          azureWebAppSettings: [],
          azureWebAppActiveDetail: undefined,
        }),
      );
    });
    try {
      const workspaceResult = await backendRequest<WorkspaceSnapshot>("azure.webApps.select", {
        appName: trimmed,
      });
      startTransition(() => {
        setWorkspace((current) => mergeAzureResourceGroupSelection(current, workspaceResult));
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "App Service selection failed";
      pushNotification("error", "Could not select web app", message);
    } finally {
      endAzureInventoryFetch();
    }
  }

  async function selectAzureVirtualMachine(vmId: string): Promise<void> {
    const trimmed = vmId.trim();
    if (!trimmed) {
      return;
    }
    beginAzureInventoryFetch();
    startTransition(() => {
      setSession((current) =>
        normaliseSessionSnapshot({
          ...current,
          selectedAzureVmId: trimmed,
        }),
      );
      setWorkspace((current) =>
        normaliseWorkspaceSnapshot({
          ...current,
          selectedAzureVmId: trimmed,
        }),
      );
    });
    try {
      const workspaceResult = await backendRequest<WorkspaceSnapshot>("azure.selectVirtualMachine", {
        vmId: trimmed,
      });
      startTransition(() => {
        setWorkspace((current) =>
          mergeAzureResourceGroupSelection(current, workspaceResult),
        );
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Virtual machine selection failed";
      pushNotification("error", "Could not select virtual machine", message);
    } finally {
      endAzureInventoryFetch();
    }
  }

  async function selectAzureResourceGroup(resourceGroup: string): Promise<void> {
    const trimmed = resourceGroup.trim();
    if (!trimmed) {
      return;
    }
    beginAzureInventoryFetch();
    startTransition(() => {
      setSession((current) =>
        normaliseSessionSnapshot({
          ...current,
          selectedAzureResourceGroup: trimmed,
          selectedAzureVmId: undefined,
        }),
      );
      setWorkspace((current) =>
        normaliseWorkspaceSnapshot({
          ...current,
          selectedAzureResourceGroup: trimmed,
          selectedAzureVmId: undefined,
          azureVirtualMachines: [],
          azureWebApps: [],
          azureAppServicePlans: [],
          azureWebAppSettings: [],
          selectedAzureWebAppName: undefined,
          azureStatusMessage: `Loading virtual machines from ${trimmed}...`,
          azureAppServiceStatusMessage: `Loading App Service web apps from ${trimmed}...`,
        }),
      );
    });
    try {
      const workspaceResult = await backendRequest<WorkspaceSnapshot>("azure.selectResourceGroup", {
        resourceGroup: trimmed,
      });
      startTransition(() => {
        setWorkspace((current) =>
          mergeAzureResourceGroupSelection(current, workspaceResult),
        );
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Resource group selection failed";
      pushNotification("error", "Could not load resource group inventory", message);
    } finally {
      endAzureInventoryFetch();
    }
  }

  async function refreshAzureFrontDoorTopology(
    current: WorkspaceSnapshot,
    sessionProfileId: string,
    options: { force?: boolean } = {},
  ): Promise<void> {
    if (frontDoorRefreshInFlightRef.current) {
      return;
    }
    if (!options.force && frontDoorTopologyLoaded(current, sessionProfileId)) {
      setAzureFrontDoorTopologyLoading(false);
      return;
    }

    frontDoorRefreshInFlightRef.current = true;
    beginAzureInventoryFetch();
    setAzureFrontDoorTopologyLoading(true);
    try {
      const workspaceResult = await backendRequest<WorkspaceSnapshot>("azure.frontDoor.refresh", {});
      startTransition(() => {
        setWorkspace((prev) => mergeAzureFrontDoorSelection(prev, workspaceResult));
      });
      setAzureFrontDoorActionStatus("");
    } catch (error) {
      pushNotification(
        "error",
        "Could not refresh Front Door topology",
        formatBackendError(error),
      );
      setAzureFrontDoorActionStatus(formatBackendError(error));
    } finally {
      frontDoorRefreshInFlightRef.current = false;
      endAzureInventoryFetch();
      setAzureFrontDoorTopologyLoading(false);
    }
  }

  async function refreshAzureWafPolicyConfig(
    current: WorkspaceSnapshot,
    sessionProfileId: string,
  ): Promise<void> {
    if (wafRefreshInFlightRef.current) {
      return;
    }
    const selected =
      current.selectedAzureWafPolicy?.trim() ||
      current.azureWafPolicies?.[0]?.name?.trim() ||
      "";
    const inventoryReady =
      azureInventoryLoaded(current, "waf") && current.profile?.profileId === sessionProfileId;
    if (
      inventoryReady &&
      (!selected || current.azureWafPolicyDetail?.name === selected)
    ) {
      setAzureWafConfigLoading(false);
      return;
    }

    wafRefreshInFlightRef.current = true;
    beginAzureInventoryFetch();
    setAzureWafConfigLoading(true);
    try {
      let workspaceResult: WorkspaceSnapshot;
      try {
        workspaceResult = await backendRequest<WorkspaceSnapshot>("azure.waf.refresh", {});
      } catch (error) {
        const message = formatBackendError(error);
        const missingRefresh =
          message.includes("unknown backend method") &&
          message.includes("azure.waf.refresh");
        if (!missingRefresh || !selected) {
          throw error;
        }
        workspaceResult = await backendRequest<WorkspaceSnapshot>("azure.waf.selectPolicy", {
          policyName: selected,
        });
      }
      startTransition(() => {
        setWorkspace((prev) => mergeAzureWafSelection(prev, workspaceResult));
      });
    } catch (error) {
      pushNotification(
        "error",
        "Could not refresh WAF policy config",
        formatBackendError(error),
      );
    } finally {
      wafRefreshInFlightRef.current = false;
      endAzureInventoryFetch();
      setAzureWafConfigLoading(false);
    }
  }

  useEffect(() => {
    azureInventoryFetchedScopesRef.current.clear();
    awsInventoryFetchedScopesRef.current.clear();
  }, [session.lockedProfileId, session.selectedProfileId, session.isLocked]);

  useEffect(() => {
    if (
      !session.isLocked ||
      session.lockedProviderId !== "azure" ||
      !workspaceLoaded
    ) {
      return;
    }
    const scope = azureInventoryScopeForTab(activeWorkspaceTabId);
    if (!scope) {
      return;
    }
    if (
      azureInventoryFetchedScopesRef.current.has(scope) ||
      azureInventoryLoaded(workspace, scope)
    ) {
      return;
    }
    azureInventoryFetchedScopesRef.current.add(scope);
    beginAzureInventoryFetch();
    void backendRequest<WorkspaceSnapshot>("azure.inventory.get", { scope })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace((current) =>
            mergeAzureInventoryScope(current, workspaceResult, scope),
          );
        });
      })
      .catch((error: unknown) => {
        azureInventoryFetchedScopesRef.current.delete(scope);
        pushNotification(
          "error",
          "Could not load Azure service inventory",
          formatBackendError(error),
        );
      })
      .finally(() => {
        endAzureInventoryFetch();
      });
    // workspace is read for azureInventoryLoaded only; azureInventoryFetchedScopesRef
    // is the primary guard against duplicate fetches (exhaustive-deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scope ref + tab id drive fetches
  }, [
    activeWorkspaceTabId,
    session.isLocked,
    session.lockedProviderId,
    session.selectedProfileId,
    workspaceLoaded,
    azureInventoryRefreshToken,
  ]);

  useEffect(() => {
    if (
      !session.isLocked ||
      session.lockedProviderId !== "aws" ||
      !workspaceLoaded
    ) {
      return;
    }
    const scope = awsInventoryScopeForTab(activeWorkspaceTabId);
    if (!scope) {
      return;
    }
    if (
      awsInventoryFetchedScopesRef.current.has(scope) ||
      awsInventoryLoaded(workspace, scope)
    ) {
      return;
    }
    awsInventoryFetchedScopesRef.current.add(scope);
    beginAwsInventoryFetch();
    void backendRequest<WorkspaceSnapshot>("aws.inventory.get", { scope })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace((current) =>
            mergeAwsInventoryScope(current, workspaceResult, scope),
          );
        });
      })
      .catch((error: unknown) => {
        awsInventoryFetchedScopesRef.current.delete(scope);
        pushNotification(
          "error",
          "Could not load AWS service inventory",
          formatBackendError(error),
        );
      })
      .finally(() => {
        endAwsInventoryFetch();
      });
    // workspace is read for awsInventoryLoaded only; awsInventoryFetchedScopesRef
    // is the primary guard against duplicate fetches (exhaustive-deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scope ref + tab id drive fetches
  }, [
    activeWorkspaceTabId,
    session.isLocked,
    session.lockedProviderId,
    session.selectedProfileId,
    workspaceLoaded,
    awsInventoryRefreshToken,
  ]);

  useEffect(() => {
    if (!session.isLocked || activeWorkspaceTabId !== "azure-front-door") {
      setAzureFrontDoorTopologyLoading(false);
      return;
    }
    void refreshAzureFrontDoorTopology(workspace, session.selectedProfileId ?? "");
  }, [activeWorkspaceTabId, session.isLocked, session.selectedProfileId]);

  useEffect(() => {
    if (!session.isLocked || activeWorkspaceTabId !== "azure-waf") {
      setAzureWafConfigLoading(false);
      return;
    }
    void refreshAzureWafPolicyConfig(workspace, session.selectedProfileId ?? "");
  }, [activeWorkspaceTabId, session.isLocked, session.selectedProfileId]);

  async function selectAzureWafPolicy(policyName: string): Promise<void> {
    const trimmed = policyName.trim();
    if (!trimmed) {
      return;
    }
    const previousPolicy = workspace.selectedAzureWafPolicy;
    beginAzureInventoryFetch();
    startTransition(() => {
      setSession((current) =>
        normaliseSessionSnapshot({
          ...current,
          selectedAzureWafPolicy: trimmed,
        }),
      );
      setWorkspace((current) =>
        normaliseWorkspaceSnapshot({
          ...current,
          selectedAzureWafPolicy: trimmed,
        }),
      );
    });
    try {
      const workspaceResult = await backendRequest<WorkspaceSnapshot>("azure.waf.selectPolicy", {
        policyName: trimmed,
      });
      startTransition(() => {
        setWorkspace((current) => mergeAzureWafSelection(current, workspaceResult));
      });
    } catch (error) {
      setWorkspace((current) => ({ ...current, selectedAzureWafPolicy: previousPolicy }));
      pushNotification("error", "Could not select WAF policy", formatBackendError(error));
    } finally {
      endAzureInventoryFetch();
    }
  }

  async function selectAzureLogAnalyticsWorkspace(nextWorkspace: string): Promise<void> {
    const requestID = ++azureLogWorkspaceSelectionRequest.current;
    const previousWorkspace = workspace.selectedAzureLogWorkspace;
    setAzureLogWorkspaceSelectionLoading(true);
    setWorkspace((current) => ({ ...current, selectedAzureLogWorkspace: nextWorkspace }));
    try {
      const result = await backendRequest<AzureLogAnalyticsSelectionResult>(
        "azure.logAnalytics.selectWorkspace",
        { workspace: nextWorkspace },
      );
      if (requestID !== azureLogWorkspaceSelectionRequest.current) return;
      setWorkspace((current) => ({ ...current, selectedAzureLogWorkspace: result.workspace }));
    } catch (error) {
      if (requestID !== azureLogWorkspaceSelectionRequest.current) return;
      setWorkspace((current) => ({ ...current, selectedAzureLogWorkspace: previousWorkspace }));
      const message = error instanceof Error ? error.message : "Workspace selection failed";
      pushNotification("error", "Could not select Log Analytics workspace", message);
    } finally {
      if (requestID === azureLogWorkspaceSelectionRequest.current) {
        setAzureLogWorkspaceSelectionLoading(false);
      }
    }
  }

  // Stable references so the Log Analytics / WAF views' history+saved effects
  // (which list them on workspace change) do not re-fire on every App re-render.
  const listLogAnalyticsHistory = useCallback(
    (ws: string) =>
      backendRequest<AzureLogAnalyticsHistoryEntry[]>("azure.logAnalytics.history.list", {
        workspace: ws,
      }),
    [],
  );
  const listLogAnalyticsSaved = useCallback(
    (ws: string) =>
      backendRequest<AzureLogAnalyticsSavedQuery[]>("azure.logAnalytics.saved.list", {
        workspace: ws,
      }),
    [],
  );

  async function refreshDiscovery(): Promise<void> {
    // The refresh runs as a backend job; the deferred workspace snapshot arrives
    // via job.updated when the job completes. Show the indicator straight away,
    // and clear it if the job fails to even start.
    beginWorkspaceFetch();
    try {
      const job = await backendRequest<JobStatus>("actions.invoke", {
        actionId: "refresh",
      });
      discoveryRefreshJobIdRef.current = job.jobId;
    } catch (error) {
      discoveryRefreshJobIdRef.current = undefined;
      endWorkspaceFetch();
      throw error;
    }
  }

  function refreshEC2Inventory(): void {
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
  }

  function selectEC2Region(region: string): void {
    setEC2ActionStatus("Select an instance to run lifecycle actions.");
    setEC2ActionInFlight(false);
    void backendRequest<WorkspaceSnapshot>("aws.ec2.selectRegion", { region }).then((workspaceResult) => {
      startTransition(() => {
        setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
      });
    });
  }

  function selectEC2Instance(instanceId: string): void {
    setEC2ActionStatus("Instance selected. EC2 lifecycle writes require a local endpoint profile with write opt-in.");
    setEC2ActionInFlight(false);
    void backendRequest<WorkspaceSnapshot>("aws.ec2.selectInstance", { instanceId }).then((workspaceResult) => {
      startTransition(() => {
        setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
      });
    });
  }

  function invokeEC2LifecycleAction(action: EC2LifecycleAction, instanceId: string): void {
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
  }

  // Lambda handlers (v0.6 cloud breadth). Mirror EC2 style for region/function select + safe invoke.
  function refreshLambdaInventory(): void {
    const region = workspace.selectedLambdaRegion;
    if (!region) {
      setLambdaActionStatus("Select a region before refreshing Lambda inventory.");
      return;
    }
    setLambdaActionStatus(`Refreshing Lambda functions for ${region}.`);
    void backendRequest<WorkspaceSnapshot>("aws.lambda.selectRegion", { region })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setLambdaActionStatus(workspaceResult.lambdaStatusMessage || `Loaded Lambda functions from ${region}.`);
        setLambdaInvokeResult(null);
      })
      .catch((error: unknown) => {
        setLambdaActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  function selectLambdaRegion(region: string): void {
    setLambdaActionStatus(`Loading Lambda functions for ${region}.`);
    setLambdaInvokeInFlight(false);
    setLambdaInvokeResult(null);
    void backendRequest<WorkspaceSnapshot>("aws.lambda.selectRegion", { region })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setLambdaActionStatus(
          workspaceResult.lambdaStatusMessage || `Loaded Lambda functions from ${region}.`,
        );
      })
      .catch((error: unknown) => {
        setLambdaActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  function selectLambdaFunction(functionName: string): void {
    setLambdaInvokeResult(null);
    void backendRequest<WorkspaceSnapshot>("aws.lambda.selectFunction", { functionName })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setLambdaActionStatus(
          workspaceResult.lambdaStatusMessage || `Selected Lambda function ${functionName}.`,
        );
      })
      .catch((error: unknown) => {
        setLambdaActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  function invokeLambda(functionName: string, payload: unknown): void {
    if (lambdaInvokeInFlight) return;
    setLambdaInvokeInFlight(true);
    const region = workspace.selectedLambdaRegion || "us-east-1";
    setLambdaActionStatus(`Invoking ${functionName} in ${region}...`);
    void backendRequest<AwsLambdaInvokeResult>("aws.lambda.invoke", { functionName, payload: payload || {} })
      .then((result) => {
        setLambdaInvokeResult(result);
        setLambdaActionStatus(`Invoke completed (status ${result?.statusCode ?? "?"})`);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        setLambdaActionStatus(message);
        setLambdaInvokeResult({ statusCode: 0, error: message });
      })
      .finally(() => setLambdaInvokeInFlight(false));
  }

  function createLambda(input: AwsLambdaCreateInput): void {
    if (lambdaCreateInFlight) {
      return;
    }
    setLambdaCreateInFlight(true);
    const region = workspace.selectedLambdaRegion || "us-east-1";
    setLambdaActionStatus(`Creating ${input.functionName} in ${region}...`);
    void backendRequest<WorkspaceSnapshot>("aws.lambda.create", { ...input })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setLambdaActionStatus(
          workspaceResult.lambdaStatusMessage ||
            `Created Lambda function ${input.functionName} in ${region}.`,
        );
        setLambdaInvokeResult(null);
      })
      .catch((error: unknown) => {
        setLambdaActionStatus(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setLambdaCreateInFlight(false));
  }

  function refreshDynamoDBInventory(): void {
    const region = workspace.selectedDynamodbRegion;
    if (!region) {
      setDynamodbActionStatus("Select a region before refreshing DynamoDB inventory.");
      return;
    }
    setDynamodbActionStatus(`Refreshing DynamoDB tables for ${region}.`);
    void backendRequest<WorkspaceSnapshot>("aws.dynamodb.selectRegion", { region })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setDynamodbActionStatus(
          workspaceResult.dynamodbStatusMessage || `Loaded DynamoDB tables from ${region}.`,
        );
      })
      .catch((error: unknown) => {
        setDynamodbActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  function selectDynamoDBRegion(region: string): void {
    setDynamodbActionStatus(`Loading DynamoDB tables for ${region}.`);
    void backendRequest<WorkspaceSnapshot>("aws.dynamodb.selectRegion", { region })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setDynamodbActionStatus(
          workspaceResult.dynamodbStatusMessage || `Loaded DynamoDB tables from ${region}.`,
        );
      })
      .catch((error: unknown) => {
        setDynamodbActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  const activeWorkspace = useMemo(
    () => applySessionWriteModeToWorkspace(workspace, session),
    [workspace, session],
  );
  const azureServiceInventoryLoading =
    session.lockedProviderId === "azure" &&
    (azureInventoryLoading || workspaceFetching || !workspaceLoaded);
  const writeModeEnabled =
    session.lockedProviderId === "azure"
      ? activeWorkspace.azureWriteModeEnabled
      : activeWorkspace.awsWriteModeEnabled;
  const writeModeCapable =
    session.lockedProviderId === "azure"
      ? activeWorkspace.azureWriteCapable
      : activeWorkspace.awsWriteCapable;

  function requestWriteModeChange(): void {
    if (writeModePending) {
      return;
    }
    if (writeModeEnabled) {
      void setWriteMode(false);
      return;
    }
    setWriteModeDialogIntent(writeModeCapable ? "enable" : "incapable");
    setWriteModeDialogOpen(true);
  }

  function setWriteMode(enabled: boolean): void {
    const token = ++writeModeRequestRef.current;
    setWriteModePending(true);
    void backendRequest<SessionSnapshot>("session.setWriteMode", { enabled })
      .then((sessionResult) => {
        if (token !== writeModeRequestRef.current) {
          return;
        }
        const normalisedSession = normaliseSessionSnapshot(sessionResult);
        startTransition(() => {
          setSession(normalisedSession);
          setWorkspace((currentWorkspace) =>
            applySessionWriteModeToWorkspace(currentWorkspace, normalisedSession),
          );
        });
        setWriteModeDialogOpen(false);
      })
      .catch((error: unknown) => {
        if (token !== writeModeRequestRef.current) {
          return;
        }
        notify(
          "error",
          "Write mode",
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => {
        if (token === writeModeRequestRef.current) {
          setWriteModePending(false);
        }
      });
  }

  function selectDynamoDBTable(tableName: string): void {
    void backendRequest<WorkspaceSnapshot>("aws.dynamodb.selectTable", { tableName })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setDynamodbActionStatus(
          workspaceResult.dynamodbStatusMessage || `Selected DynamoDB table ${tableName}.`,
        );
      })
      .catch((error: unknown) => {
        setDynamodbActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  function refreshSQSInventory(): void {
    const region = workspace.selectedSqsRegion;
    if (!region) {
      setSqsActionStatus("Select a region before refreshing SQS inventory.");
      return;
    }
    setSqsActionStatus(`Refreshing SQS queues for ${region}.`);
    void backendRequest<WorkspaceSnapshot>("aws.sqs.selectRegion", { region })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setSqsActionStatus(
          workspaceResult.sqsStatusMessage || `Loaded SQS queues from ${region}.`,
        );
      })
      .catch((error: unknown) => {
        setSqsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  function selectSQSRegion(region: string): void {
    setSqsActionStatus(`Loading SQS queues for ${region}.`);
    void backendRequest<WorkspaceSnapshot>("aws.sqs.selectRegion", { region })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setSqsActionStatus(
          workspaceResult.sqsStatusMessage || `Loaded SQS queues from ${region}.`,
        );
      })
      .catch((error: unknown) => {
        setSqsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  function selectSQSQueue(queueUrl: string): void {
    void backendRequest<WorkspaceSnapshot>("aws.sqs.selectQueue", { queueUrl })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setSqsActionStatus(
          workspaceResult.sqsStatusMessage || "Selected SQS queue.",
        );
      })
      .catch((error: unknown) => {
        setSqsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  function peekSQSQueue(queueUrl: string): void {
    setSqsPeekInFlight(true);
    setSqsActionStatus("Peeking SQS messages without deleting them.");
    void backendRequest<AwsSqsPeekResult>("aws.sqs.peek", { queueUrl })
      .then((result) => {
        setSqsPeekResult(result);
        setSqsActionStatus(result.summary || "SQS peek completed.");
      })
      .catch((error: unknown) => {
        setSqsActionStatus(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setSqsPeekInFlight(false));
  }

  function sendSQSMessage(queueUrl: string, messageBody: string): void {
    setSqsPeekInFlight(true);
    setSqsActionStatus("Sending message to the queue.");
    void backendRequest<{ summary: string }>("aws.sqs.sendMessage", { queueUrl, messageBody })
      .then((result) => {
        setSqsActionStatus(result.summary || "Message sent.");
      })
      .catch((error: unknown) => {
        setSqsActionStatus(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setSqsPeekInFlight(false));
  }

  function createSQSQueue(queueName: string): void {
    setSqsActionStatus(`Creating SQS queue ${queueName}.`);
    void backendRequest<WorkspaceSnapshot>("aws.sqs.createQueue", { queueName })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setSqsActionStatus(
          workspaceResult.sqsStatusMessage || `Created SQS queue ${queueName}.`,
        );
      })
      .catch((error: unknown) => {
        setSqsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  function refreshSNSInventory(): void {
    const region = workspace.selectedSnsRegion;
    if (!region) {
      setSnsActionStatus("Select a region before refreshing SNS inventory.");
      return;
    }
    selectSNSRegion(region);
  }

  function selectSNSRegion(region: string): void {
    setSnsActionStatus(`Loading SNS topics for ${region}.`);
    void backendRequest<WorkspaceSnapshot>("aws.sns.selectRegion", { region })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setSnsActionStatus(
          workspaceResult.snsStatusMessage || `Loaded SNS topics from ${region}.`,
        );
      })
      .catch((error: unknown) => {
        setSnsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  function selectSNSTopic(topicArn: string): void {
    void backendRequest<WorkspaceSnapshot>("aws.sns.selectTopic", { topicArn })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setSnsActionStatus(workspaceResult.snsStatusMessage || "Selected SNS topic.");
      })
      .catch((error: unknown) => {
        setSnsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  function publishSNSTopic(topicArn: string, message: string): void {
    setSnsActionStatus("Publishing message to the topic.");
    void backendRequest<{ summary: string }>("aws.sns.publish", { topicArn, message })
      .then((result) => {
        setSnsActionStatus(result.summary || "Message published.");
      })
      .catch((error: unknown) => {
        setSnsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  function createSNSTopic(topicName: string): void {
    setSnsActionStatus(`Creating SNS topic ${topicName}.`);
    void backendRequest<WorkspaceSnapshot>("aws.sns.createTopic", { topicName })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setSnsActionStatus(
          workspaceResult.snsStatusMessage || `Created SNS topic ${topicName}.`,
        );
      })
      .catch((error: unknown) => {
        setSnsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  function putDynamoDBItem(tableName: string, itemJson: string): void {
    setDynamodbActionStatus(`Putting item into ${tableName}.`);
    void backendRequest<WorkspaceSnapshot>("aws.dynamodb.putItem", { tableName, itemJson })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setDynamodbActionStatus(
          workspaceResult.dynamodbStatusMessage || `Put item into ${tableName}.`,
        );
      })
      .catch((error: unknown) => {
        setDynamodbActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  function deleteDynamoDBItem(tableName: string, keyJson: string): void {
    setDynamodbActionStatus(`Deleting item from ${tableName}.`);
    void backendRequest<WorkspaceSnapshot>("aws.dynamodb.deleteItem", { tableName, keyJson })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setDynamodbActionStatus(
          workspaceResult.dynamodbStatusMessage || `Deleted item from ${tableName}.`,
        );
      })
      .catch((error: unknown) => {
        setDynamodbActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  function refreshRDSInventory(): void {
    const region = workspace.selectedRdsRegion;
    if (!region) {
      setRdsActionStatus("Select a region before refreshing RDS inventory.");
      return;
    }
    selectRDSRegion(region);
  }

  function selectRDSRegion(region: string): void {
    setRdsActionStatus(`Loading RDS instances for ${region}.`);
    void backendRequest<WorkspaceSnapshot>("aws.rds.selectRegion", { region })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setRdsActionStatus(
          workspaceResult.rdsStatusMessage || `Loaded RDS instances from ${region}.`,
        );
      })
      .catch((error: unknown) => {
        setRdsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  function selectRDSInstance(instanceId: string): void {
    void backendRequest<WorkspaceSnapshot>("aws.rds.selectInstance", { instanceId })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setRdsActionStatus(workspaceResult.rdsStatusMessage || "Selected RDS instance.");
      })
      .catch((error: unknown) => {
        setRdsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  function refreshLogsInventory(): void {
    const region = workspace.selectedLogsRegion;
    if (!region) {
      setLogsActionStatus("Select a region before refreshing log groups.");
      return;
    }
    selectLogsRegion(region);
  }

  function selectLogsRegion(region: string): void {
    setLogsActionStatus(`Loading log groups for ${region}.`);
    void backendRequest<WorkspaceSnapshot>("aws.logs.selectRegion", { region })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setLogsActionStatus(
          workspaceResult.logsStatusMessage || `Loaded log groups from ${region}.`,
        );
      })
      .catch((error: unknown) => {
        setLogsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  function selectLogGroup(logGroupName: string): void {
    void backendRequest<WorkspaceSnapshot>("aws.logs.selectLogGroup", { logGroupName })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setLogsActionStatus(workspaceResult.logsStatusMessage || "Selected log group.");
      })
      .catch((error: unknown) => {
        setLogsActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  function refreshIAMInventory(): void {
    setIamActionStatus("Refreshing IAM roles and policies.");
    void backendRequest<WorkspaceSnapshot>("workspace.get")
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setIamActionStatus(workspaceResult.iamStatusMessage || "IAM inventory refreshed.");
      })
      .catch((error: unknown) => {
        setIamActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  function selectIAMRole(roleName: string): void {
    void backendRequest<WorkspaceSnapshot>("aws.iam.selectRole", { roleName })
      .then((workspaceResult) => {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
        setIamActionStatus(workspaceResult.iamStatusMessage || "Selected IAM role.");
      })
      .catch((error: unknown) => {
        setIamActionStatus(error instanceof Error ? error.message : String(error));
      });
  }

  // Applies an S3 prefix filter, ignoring stale responses that finish after a
  // newer request has been issued (keeps fast typing from reverting the list).
  function applyS3PrefixFilter(prefix: string): void {
    const requestId = s3PrefixRequestIdRef.current + 1;
    s3PrefixRequestIdRef.current = requestId;
    void backendRequest<WorkspaceSnapshot>("aws.s3.setPrefixFilter", { prefix }).then((workspaceResult) => {
      if (requestId === s3PrefixRequestIdRef.current) {
        startTransition(() => {
          setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
        });
      }
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
        setNotificationsOpen(false);
        setShowSensitiveValues(false);
      });
      notifications.clearAll();
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
        ...current,
        dockerRuntime,
        dockerResources,
        dockerDiagnostics: dockerDiagnosticsFromRuntime(dockerRuntime),
      }));
    });
  }

  async function refreshVirtualisationState(): Promise<WorkspaceSnapshot> {
    const [runtimeResult, logResult, flociLogResult] = await Promise.all([
      backendRequest<RuntimeSnapshot>("runtime.get"),
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
    return await new Promise<WorkspaceSnapshot>((resolve) => {
      startTransition(() => {
        setWorkspace((current) => {
          const nextWorkspace = normaliseWorkspaceSnapshot({
            ...current,
            dockerRuntime: runtimeResult.dockerRuntime,
            dockerResources: runtimeResult.dockerResources,
            emulatorSummaries: runtimeResult.emulatorSummaries,
            dockerDiagnostics: runtimeResult.dockerDiagnostics,
          });
          resolve(nextWorkspace);
          return nextWorkspace;
        });
        setLocalStackLogs(normaliseEmulatorLogSnapshot(logResult));
        setFlociAzLogs(normaliseEmulatorLogSnapshot(flociLogResult));
      });
    });
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

  async function loadState(
    options: { refreshWorkspace?: boolean } = {},
  ): Promise<void> {
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

      if (options.refreshWorkspace !== false) {
        void loadWorkspace(normalisedSession).catch((error) => {
          pushNotification(
            "error",
            "Could not refresh the workspace",
            formatBackendError(error),
          );
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkspace(sessionSnapshot: SessionSnapshot): Promise<void> {
    if (!sessionSnapshot.isLocked) {
      setWorkspace(emptyWorkspace);
      setWorkspaceLoaded(false);
      resetWorkspaceFetch();
      return;
    }
    azureInventoryFetchedScopesRef.current.clear();
    awsInventoryFetchedScopesRef.current.clear();
    beginWorkspaceFetch();
    try {
      const workspaceResult = await backendRequest<WorkspaceSnapshot>("workspace.get");
      startTransition(() => {
        const normalised = normaliseWorkspaceSnapshot(workspaceResult);
        setWorkspace(normalised);
        setWorkspaceLoaded(true);
        if (!lambdaInvokeInFlight && normalised.lambdaStatusMessage) {
          setLambdaActionStatus(normalised.lambdaStatusMessage);
        }
        if (normalised.dynamodbStatusMessage) {
          setDynamodbActionStatus(normalised.dynamodbStatusMessage);
        }
        if (!sqsPeekInFlight && normalised.sqsStatusMessage) {
          setSqsActionStatus(normalised.sqsStatusMessage);
        }
        if (normalised.snsStatusMessage) {
          setSnsActionStatus(normalised.snsStatusMessage);
        }
        if (normalised.rdsStatusMessage) {
          setRdsActionStatus(normalised.rdsStatusMessage);
        }
        if (normalised.logsStatusMessage) {
          setLogsActionStatus(normalised.logsStatusMessage);
        }
        if (normalised.iamStatusMessage) {
          setIamActionStatus(normalised.iamStatusMessage);
        }
      });
    } finally {
      endWorkspaceFetch();
    }
  }

  sessionSnapshotRef.current = session;
  loadWorkspaceRef.current = loadWorkspace;

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
    return parseEnvironment(localStackEnvironmentText, ["LOCALSTACK_AUTH_TOKEN", "PERSISTENCE"]);
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

  function pushNotification(tone: NotificationTone, header: string, content: string): void {
    notify(tone, header, content);
  }

  // Errors and warnings from an emulator carry a "View logs" action that jumps
  // to the Local Runtime view, where the LogStream is shown.
  function emulatorNotifyOptions(tone: NotificationTone) {
    if (tone === "error" || tone === "warning") {
      return {
        action: {
          label: "View logs",
          run: () => setActiveWorkspaceTabId("virtualisation"),
        },
      };
    }
    return undefined;
  }

  function addLocalStackNotification(tone: NotificationTone, header: string, content: string): void {
    notify(tone, header, content, emulatorNotifyOptions(tone));
  }

  function addEmulatorNotification(_emulatorId: string, tone: NotificationTone, header: string, content: string): void {
    notify(tone, header, content, emulatorNotifyOptions(tone));
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

  async function invokeLocalStackAction(action: "prepareProfile" | "start" | "stop" | "recreate"): Promise<void> {
    const method =
      action === "prepareProfile"
        ? "emulators.prepareProfile"
        : action === "stop"
          ? "emulators.stop"
          : "emulators.start";
    const startParams =
      action === "start" || action === "recreate"
        ? {
          emulatorId: "localstack",
          authToken: localStackAuthToken,
          persistence: localStackPersistence,
          environment: localStackEnvironment(),
          // Only sent for recreate so a normal start keeps its minimal payload.
          ...(action === "recreate" ? { recreate: true } : {}),
        }
        : { emulatorId: "localstack" };
    const label =
      action === "prepareProfile"
        ? "Prepare LocalStack profile"
        : action === "start"
          ? "Start LocalStack"
          : action === "recreate"
            ? "Recreate LocalStack"
          : "Stop LocalStack";
    const requestTimeoutMs = action === "recreate" ? 95000 : 22000;
    setLocalStackActionInFlight(true);
    setLocalStackActionStatus(`${label} requested.`);
    try {
      const result = await withTimeout(
        backendRequest<EmulatorActionResult>(method, startParams),
        requestTimeoutMs,
        `${label} did not finish within ${Math.round(requestTimeoutMs / 1000)} seconds. Check Docker and LocalStack logs, then retry.`,
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
      if (action === "start" || action === "recreate" || action === "stop") {
        pollLocalStackState(label, action === "stop" ? "stopped" : "running");
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : `${label} failed.`;
      const timedOut = rawMessage.includes("did not finish within");
      const message =
        rawMessage === `${label} failed.`
          ? `${label} failed. Docker did not complete the request. Try Recreate LocalStack, refresh Docker, check the logs, then retry.`
          : rawMessage;
      setLocalStackActionStatus(message);
      addLocalStackNotification(timedOut ? "warning" : "error", timedOut ? `${label} still pending` : `${label} failed`, message);
      await refreshVirtualisationState().catch(() => undefined);
      if (timedOut && (action === "start" || action === "recreate" || action === "stop")) {
        pollLocalStackState(label, action === "stop" ? "stopped" : "running");
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

  async function invokeFlociAzAction(action: "prepareProfile" | "start" | "stop" | "recreate"): Promise<void> {
    const method =
      action === "prepareProfile"
        ? "emulators.prepareProfile"
        : action === "stop"
          ? "emulators.stop"
          : "emulators.start";
    const startParams =
      action === "start" || action === "recreate"
        ? {
          emulatorId: "floci-az",
          persistence: flociAzPersistence,
          environment: flociAzEnvironment(),
          // Only sent for recreate so a normal start keeps its minimal payload.
          ...(action === "recreate" ? { recreate: true } : {}),
        }
        : { emulatorId: "floci-az" };
    const label =
      action === "prepareProfile"
        ? "Prepare floci-az config"
        : action === "start"
          ? "Start floci-az"
          : action === "recreate"
            ? "Recreate floci-az"
          : "Stop floci-az";
    const requestTimeoutMs = action === "recreate" ? 95000 : 22000;
    setFlociAzActionInFlight(true);
    setFlociAzActionStatus(`${label} requested.`);
    try {
      const result = await withTimeout(
        backendRequest<EmulatorActionResult>(method, startParams),
        requestTimeoutMs,
        `${label} did not finish within ${Math.round(requestTimeoutMs / 1000)} seconds. Check Docker and floci-az logs, then retry.`,
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
      if (action === "start" || action === "recreate" || action === "stop") {
        pollFlociAzState(label, action === "stop" ? "stopped" : "running");
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : `${label} failed.`;
      const timedOut = rawMessage.includes("did not finish within");
      const message =
        rawMessage === `${label} failed.`
          ? `${label} failed. Docker did not complete the request. Try Recreate floci-az, refresh Docker, check the logs, then retry.`
          : rawMessage;
      setFlociAzActionStatus(message);
      addEmulatorNotification("floci-az", timedOut ? "warning" : "error", timedOut ? `${label} still pending` : `${label} failed`, message);
      await refreshVirtualisationState().catch(() => undefined);
      if (timedOut && (action === "start" || action === "recreate" || action === "stop")) {
        pollFlociAzState(label, action === "start" ? "running" : "stopped");
      }
    } finally {
      setFlociAzActionInFlight(false);
    }
  }

  const content = activeWorkspaceTabId === "debug" ? (
    <DebugView />
  ) : activeWorkspaceTabId === "deploy" ? (
    <DeployView profiles={profiles} />
  ) : session.isLocked && activeWorkspaceTabId === "overview" ? (
    <OverviewView
      workspace={activeWorkspace}
      session={session}
      providerLabel={workspace.provider?.label ?? selectedProvider?.label ?? "Workspace"}
      profileLabel={workspace.profile?.displayName ?? selectedProfile?.displayName}
      onRefresh={() => {
        void refreshDiscovery();
      }}
      onOpenRuntime={() => {
        setActiveWorkspaceTabId("virtualisation");
      }}
      onEmulatorQuickStart={(emulatorId) => {
        if (emulatorId === "localstack") {
          void invokeLocalStackAction("start");
          return;
        }
        void invokeFlociAzAction("start");
      }}
      runtimeActionInFlight={{
        localstack: localStackActionInFlight,
        "floci-az": flociAzActionInFlight,
      }}
      onNavigate={(tabId, context) => {
        setActiveWorkspaceTabId(tabId);
        if (context?.lambdaFunctionName) {
          selectLambdaFunction(context.lambdaFunctionName);
        }
        if (context?.dynamodbTableName) {
          selectDynamoDBTable(context.dynamodbTableName);
        }
        if (context?.sqsQueueUrl) {
          selectSQSQueue(context.sqsQueueUrl);
        }
        if (context?.snsTopicArn) {
          selectSNSTopic(context.snsTopicArn);
        }
        if (context?.rdsInstanceId) {
          selectRDSInstance(context.rdsInstanceId);
        }
        if (context?.logGroupName) {
          selectLogGroup(context.logGroupName);
        }
        if (context?.iamRoleName) {
          selectIAMRole(context.iamRoleName);
        }
        if (context?.ec2InstanceId) {
          selectEC2Instance(context.ec2InstanceId);
        }
        if (context?.s3BucketName) {
          void mutateWorkspaceSelection("aws.s3.selectBucket", { bucketName: context.s3BucketName }, {
            merge: mergeAwsS3Selection,
            onOptimistic: () => {
              setWorkspace((current) =>
                normaliseWorkspaceSnapshot({
                  ...current,
                  selectedS3BucketName: context.s3BucketName,
                  selectedS3ObjectKey: undefined,
                }),
              );
            },
          });
        }
        if (context?.openLambdaCreate) {
          setLambdaCreateFormOpen(true);
        }
      }}
    />
  ) : session.isLocked && activeWorkspaceTabId === "s3" ? (
    <StorageView
      workspace={activeWorkspace}
      activePageId={activeS3PageId}
      onNavigatePage={setActiveS3PageId}
      showSensitiveValues={showSensitiveValues}
      onSelectBucket={(bucketName) => {
        void mutateWorkspaceSelection("aws.s3.selectBucket", { bucketName }, {
          merge: mergeAwsS3Selection,
          onOptimistic: () => {
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedS3BucketName: bucketName,
                selectedS3ObjectKey: undefined,
              }),
            );
          },
        });
      }}
      onSelectObject={(objectKey) => {
        void mutateWorkspaceSelection("aws.s3.selectObject", { objectKey }, {
          merge: mergeAwsS3Selection,
          persistOnly: true,
          onOptimistic: () => {
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedS3ObjectKey: objectKey,
              }),
            );
          },
        });
      }}
      onSetPrefixFilter={applyS3PrefixFilter}
      uploadStatus={s3UploadStatus}
      signedUrlStatus={s3SignedUrlStatus}
      signedUrlResult={s3SignedUrlResult}
      urlInspection={s3UrlInspection}
      urlValidation={s3UrlValidation}
      onUploadObject={(sourcePath, objectKey) => {
        setS3UploadStatus(`Queueing upload for ${objectKey}.`);
        void backendRequest("aws.s3.uploadObject", { objectKey, sourcePath });
      }}
      onPresignObject={(durationSeconds) => {
        setS3SignedUrlStatus("Queueing signed URL generation.");
        void backendRequest("aws.s3.presignObject", { durationSeconds });
      }}
      onAnalyseUrl={(url) => {
        void (async () => {
          setS3UrlInspection(await backendRequest<UrlInspection>("aws.s3.analyseUrl", { url }));
        })();
      }}
      onValidateUrl={(url) => {
        void (async () => {
          await backendRequest("aws.s3.validateUrl", { url });
        })();
      }}
    />
  ) : session.isLocked && activeWorkspaceTabId === "ec2" ? (
    <ComputeView
      workspace={activeWorkspace}
      actionStatus={ec2ActionStatus}
      actionInFlight={ec2ActionInFlight}
      actionHistory={ec2ActionHistory}
      onRefreshInstances={refreshEC2Inventory}
      onSelectRegion={selectEC2Region}
      onSelectInstance={selectEC2Instance}
      onInvokeAction={invokeEC2LifecycleAction}
    />
  ) : session.isLocked && activeWorkspaceTabId === "lambda" ? (
    <LambdaView
      workspace={activeWorkspace}
      actionStatus={lambdaActionStatus}
      invokeResult={lambdaInvokeResult}
      invokeInFlight={lambdaInvokeInFlight}
      createInFlight={lambdaCreateInFlight}
      onRefresh={refreshLambdaInventory}
      onSelectRegion={selectLambdaRegion}
      onSelectFunction={selectLambdaFunction}
      onInvoke={invokeLambda}
      onCreate={createLambda}
      openCreateForm={lambdaCreateFormOpen}
      onCreateFormOpenChange={setLambdaCreateFormOpen}
    />
  ) : session.isLocked && activeWorkspaceTabId === "dynamodb" ? (
    <DynamoDBView
      workspace={activeWorkspace}
      actionStatus={dynamodbActionStatus}
      onRefresh={refreshDynamoDBInventory}
      onSelectRegion={selectDynamoDBRegion}
      onSelectTable={selectDynamoDBTable}
      onPutItem={putDynamoDBItem}
      onDeleteItem={deleteDynamoDBItem}
    />
  ) : session.isLocked && activeWorkspaceTabId === "sqs" ? (
    <SQSView
      workspace={activeWorkspace}
      actionStatus={sqsActionStatus}
      peekResult={sqsPeekResult}
      peekInFlight={sqsPeekInFlight}
      onRefresh={refreshSQSInventory}
      onSelectRegion={selectSQSRegion}
      onSelectQueue={selectSQSQueue}
      onPeek={peekSQSQueue}
      onSendMessage={sendSQSMessage}
      onCreateQueue={createSQSQueue}
    />
  ) : session.isLocked && activeWorkspaceTabId === "sns" ? (
    <SNSView
      workspace={activeWorkspace}
      actionStatus={snsActionStatus}
      onRefresh={refreshSNSInventory}
      onSelectRegion={selectSNSRegion}
      onSelectEntity={selectSNSTopic}
      onPublish={publishSNSTopic}
      onCreateTopic={createSNSTopic}
    />
  ) : session.isLocked && activeWorkspaceTabId === "rds" ? (
    <RDSView
      workspace={activeWorkspace}
      actionStatus={rdsActionStatus}
      onRefresh={refreshRDSInventory}
      onSelectRegion={selectRDSRegion}
      onSelectEntity={selectRDSInstance}
    />
  ) : session.isLocked && activeWorkspaceTabId === "logs" ? (
    <LogsView
      workspace={activeWorkspace}
      actionStatus={logsActionStatus}
      onRefresh={refreshLogsInventory}
      onSelectRegion={selectLogsRegion}
      onSelectEntity={selectLogGroup}
    />
  ) : session.isLocked && activeWorkspaceTabId === "iam" ? (
    <IAMView
      workspace={activeWorkspace}
      actionStatus={iamActionStatus}
      onRefresh={refreshIAMInventory}
      onSelectRegion={selectSQSRegion}
      onSelectEntity={selectIAMRole}
    />
  ) : session.isLocked &&
    ["azure-overview", "azure-resource-groups", "azure-vms"].includes(activeWorkspaceTabId) ? (
    <AzureView
      workspace={activeWorkspace}
      inventoryLoading={azureServiceInventoryLoading}
      activePageId={
        activeWorkspaceTabId === "azure-resource-groups"
          ? "resource-groups"
          : activeWorkspaceTabId === "azure-vms"
            ? "virtual-machines"
            : activeAzurePageId
      }
      showSensitiveValues={showSensitiveValues}
      actionStatus={azureActionStatus}
      onSelectResourceGroup={(resourceGroup) => {
        void selectAzureResourceGroup(resourceGroup);
      }}
      onSelectVirtualMachine={(vmId) => {
        void selectAzureVirtualMachine(vmId);
      }}
      onCreateResourceGroup={(name, location) => {
        setAzureActionStatus(`Creating resource group ${name}...`);
        void backendRequest<WorkspaceSnapshot>("azure.resourceGroups.create", { name, location })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
            });
            setAzureActionStatus(workspaceResult.azureStatusMessage || `Created resource group ${name}.`);
          })
          .catch((error: unknown) => {
            setAzureActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
      onDeleteResourceGroup={(name) => {
        setAzureActionStatus(`Deleting resource group ${name}...`);
        void backendRequest<WorkspaceSnapshot>("azure.resourceGroups.delete", { name })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
            });
            setAzureActionStatus(workspaceResult.azureStatusMessage || `Deleted resource group ${name}.`);
          })
          .catch((error: unknown) => {
            setAzureActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
      onInvokeVMAction={(action, vmId) => {
        setAzureActionStatus(`Invoking ${action} on virtual machine...`);
        void backendRequest<WorkspaceSnapshot>("azure.virtualMachines.invokeAction", { action, vmId })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
            });
            setAzureActionStatus(workspaceResult.azureStatusMessage || `Invoked ${action} on virtual machine.`);
          })
          .catch((error: unknown) => {
            setAzureActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
      onListBastionHosts={() =>
        backendRequest<{ hosts: AzureBastionHost[]; statusMessage: string }>("azure.bastion.list")
      }
      onBastionConnect={(request) =>
        backendRequest<AzureBastionConnectResult>("azure.bastion.connect", request)
      }
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-storage" ? (
    <AzureStorageView
      workspace={activeWorkspace}
      activePageId={activeAzureStoragePageId}
      actionStatus={azureStorageActionStatus}
      inventoryLoading={azureServiceInventoryLoading}
      onSelectAccount={(accountName) => {
        void mutateWorkspaceSelection("azure.storage.selectAccount", { accountName }, {
          panelLoading: true,
          merge: mergeAzureStorageSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureStorageAccount: accountName,
                selectedAzureBlobContainer: undefined,
                selectedAzureBlobName: undefined,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureStorageAccount: accountName,
                selectedAzureBlobContainer: undefined,
                selectedAzureBlobName: undefined,
                azureBlobContainers: [],
                azureBlobs: [],
              }),
            );
          },
          errorTitle: "Could not select storage account",
        });
      }}
      onSelectContainer={(containerName) => {
        void mutateWorkspaceSelection("azure.storage.selectContainer", { containerName }, {
          panelLoading: true,
          merge: mergeAzureStorageSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureBlobContainer: containerName,
                selectedAzureBlobName: undefined,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureBlobContainer: containerName,
                selectedAzureBlobName: undefined,
                azureBlobs: [],
              }),
            );
          },
          errorTitle: "Could not select blob container",
        });
      }}
      onSelectBlob={(blobName) => {
        void mutateWorkspaceSelection("azure.storage.selectBlob", { blobName }, {
          persistOnly: true,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureBlobName: blobName,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureBlobName: blobName,
              }),
            );
          },
          errorTitle: "Could not select blob",
        });
      }}
      onSetPrefixFilter={(prefix) => {
        void mutateWorkspaceSelection("azure.storage.setPrefixFilter", { prefix }, {
          panelLoading: true,
          merge: mergeAzureStorageSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                azureBlobPrefixFilter: prefix,
                selectedAzureBlobName: undefined,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                azureBlobPrefixFilter: prefix,
                selectedAzureBlobName: undefined,
                azureBlobs: [],
              }),
            );
          },
          errorTitle: "Could not update blob prefix filter",
        });
      }}
      onCreateAccount={(resourceGroup, accountName, location) => {
        setAzureStorageActionStatus(`Creating storage account ${accountName}...`);
        void backendRequest<WorkspaceSnapshot>("azure.storage.createAccount", {
          resourceGroup,
          accountName,
          location,
        })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
            });
            setAzureStorageActionStatus(
              workspaceResult.azureStorageStatusMessage || `Created storage account ${accountName}.`,
            );
          })
          .catch((error: unknown) => {
            setAzureStorageActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
      onCreateContainer={(containerName) => {
        setAzureStorageActionStatus(`Creating container ${containerName}...`);
        void backendRequest<WorkspaceSnapshot>("azure.storage.createContainer", { containerName })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
            });
            setAzureStorageActionStatus(
              workspaceResult.azureStorageStatusMessage || `Created container ${containerName}.`,
            );
          })
          .catch((error: unknown) => {
            setAzureStorageActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
      onUploadBlob={(sourcePath, blobName) => {
        setAzureStorageActionStatus(`Uploading ${blobName}...`);
        void backendRequest<{ workspace: WorkspaceSnapshot }>("azure.storage.uploadBlob", {
          sourcePath,
          blobName,
        })
          .then((response) => {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(response.workspace));
            });
            setAzureStorageActionStatus(`Uploaded blob ${blobName}.`);
          })
          .catch((error: unknown) => {
            setAzureStorageActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
      onDeleteBlob={(blobName) => {
        setAzureStorageActionStatus(`Deleting blob ${blobName}...`);
        void backendRequest<WorkspaceSnapshot>("azure.storage.deleteBlob", { blobName })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
            });
            setAzureStorageActionStatus(`Deleted blob ${blobName}.`);
          })
          .catch((error: unknown) => {
            setAzureStorageActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-app-service" ? (
    <AzureAppServiceView
      workspace={activeWorkspace}
      inventoryLoading={azureServiceInventoryLoading}
      actionStatus={azureAppServiceActionStatus}
      onSelectResourceGroup={(resourceGroup) => {
        void selectAzureResourceGroup(resourceGroup);
      }}
      onSelectWebApp={(appName) => {
        void selectAzureWebApp(appName);
      }}
      onSelectSlot={(slot) => {
        void selectAzureWebAppSlot(slot);
      }}
      onEditInLogAnalytics={(workspaceName, query, timespan) => {
        setLogAnalyticsPrefill({ query, timespan });
        void selectAzureLogAnalyticsWorkspace(workspaceName).finally(() => {
          setActiveWorkspaceTabId("azure-log-analytics");
        });
      }}
      onCreateWebApp={(resourceGroup, appName, location, runtime, planOptions) => {
        setAzureAppServiceActionStatus(`Creating web app ${appName}...`);
        void backendRequest<WorkspaceSnapshot>("azure.webApps.create", {
          resourceGroup,
          appName,
          location,
          runtime,
          existingPlanName: planOptions.existingPlanName,
          newPlanName: planOptions.newPlanName,
          planSku: planOptions.planSku,
        })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
            });
            setAzureAppServiceActionStatus(
              workspaceResult.azureAppServiceStatusMessage || `Created web app ${appName}.`,
            );
          })
          .catch((error: unknown) => {
            setAzureAppServiceActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
      onInvokeAction={(action, appName) => {
        setAzureAppServiceActionStatus(`Invoking ${action} on web app...`);
        void backendRequest<WorkspaceSnapshot>("azure.webApps.invokeAction", { action, appName })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
            });
            setAzureAppServiceActionStatus(
              workspaceResult.azureAppServiceStatusMessage || `Invoked ${action} on web app.`,
            );
          })
          .catch((error: unknown) => {
            setAzureAppServiceActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
      onSetSetting={(appName, name, value, slotSetting) => {
        setAzureAppServiceActionStatus(`Setting ${name}...`);
        return backendRequest<WorkspaceSnapshot>("azure.webApps.setSetting", {
          appName,
          name,
          value,
          slotSetting,
        }).then((workspaceResult) => {
          startTransition(() => {
            setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
          });
          setAzureAppServiceActionStatus(
            workspaceResult.azureAppServiceStatusMessage || `Set application setting ${name}.`,
          );
        });
      }}
      onDeleteSetting={(appName, name) => {
        setAzureAppServiceActionStatus(`Deleting ${name}...`);
        return backendRequest<WorkspaceSnapshot>("azure.webApps.deleteSetting", {
          appName,
          name,
        }).then((workspaceResult) => {
          startTransition(() => {
            setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
          });
          setAzureAppServiceActionStatus(
            workspaceResult.azureAppServiceStatusMessage || `Deleted application setting ${name}.`,
          );
        });
      }}
      onCreateSlot={(appName, slotName) => {
        setAzureAppServiceActionStatus(`Creating deployment slot ${slotName}...`);
        void backendRequest<WorkspaceSnapshot>("azure.webApps.createSlot", { appName, slotName })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
            });
            setAzureAppServiceActionStatus(
              workspaceResult.azureAppServiceStatusMessage ||
                `Created deployment slot ${slotName}.`,
            );
          })
          .catch((error: unknown) => {
            setAzureAppServiceActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
      onSwapSlot={(appName, slotName) => {
        setAzureAppServiceActionStatus(`Swapping production with ${slotName}...`);
        void backendRequest<WorkspaceSnapshot>("azure.webApps.swapSlots", { appName, slotName })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
            });
            setAzureAppServiceActionStatus(
              workspaceResult.azureAppServiceStatusMessage ||
                `Swapped production with deployment slot ${slotName}.`,
            );
          })
          .catch((error: unknown) => {
            setAzureAppServiceActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-tools" ? (
    <ToolsHubView
      workspace={activeWorkspace}
      providerLabel={workspace.provider?.label ?? selectedProvider?.label ?? "Azure"}
      profileLabel={activeWorkspace.profile?.displayName ?? selectedProfile?.displayName}
      workspaceTabs={session.workspaceTabs}
      onNavigate={(tabId) => {
        setActiveWorkspaceTabId(tabId);
      }}
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-log-analytics" ? (
    <LogAnalyticsView
      workspace={activeWorkspace}
      workspaceSelectionLoading={azureLogWorkspaceSelectionLoading}
      inventoryLoading={azureServiceInventoryLoading}
      initialQuery={logAnalyticsPrefill?.query}
      initialTimespan={logAnalyticsPrefill?.timespan}
      onSelectWorkspace={(ws) => {
        void selectAzureLogAnalyticsWorkspace(ws);
      }}
      onRunQuery={(ws, query, timespan, maxRows, historyQuery) =>
        backendRequest<AzureLogQueryResult>("azure.logAnalytics.query", {
          workspace: ws,
          query,
          historyQuery,
          timespan,
          maxRows,
        })
      }
      onListHistory={listLogAnalyticsHistory}
      onListSaved={listLogAnalyticsSaved}
      onSaveQuery={(ws, name, query, timespan, id) =>
        backendRequest<AzureLogAnalyticsSavedQuery>("azure.logAnalytics.saved.save", {
          workspace: ws,
          name,
          query,
          timespan,
          id,
        })
      }
      onDeleteSaved={(ws, id) =>
        backendRequest<{ deleted: boolean }>("azure.logAnalytics.saved.delete", { workspace: ws, id }).then(
          () => undefined,
        )
      }
      onListTables={(ws, includeColumns) =>
        backendRequest<AzureLogAnalyticsTableInfo[]>("azure.logAnalytics.tables.list", {
          workspace: ws,
          includeColumns,
        })
      }
      onGetTableSchema={(ws, tableName) =>
        backendRequest<AzureLogAnalyticsTableInfo>("azure.logAnalytics.table.schema", {
          workspace: ws,
          tableName,
        })
      }
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-waf" ? (
    <AzureWafView
      workspace={activeWorkspace}
      workspaceSelectionLoading={azureLogWorkspaceSelectionLoading}
      inventoryLoading={azureServiceInventoryLoading}
      configLoading={azureWafConfigLoading}
      onSelectWorkspace={(ws) => {
        void selectAzureLogAnalyticsWorkspace(ws);
      }}
      onSelectPolicy={(policyName) => {
        void selectAzureWafPolicy(policyName);
      }}
      onProbeLogSchema={(ws, timespan) =>
        backendRequest<AzureWafLogSchemaProfile>("azure.waf.logs.schema", {
          workspace: ws,
          timespan,
        })
      }
      onCorrelateTrackingRef={(trackingReference, ws, timespan) => {
        setFrontDoorAccessPrefill({ trackingReference, workspace: ws, timespan });
        setActiveWorkspaceTabId("azure-front-door");
      }}
      onRunQuery={(ws, query, timespan, maxRows) =>
        backendRequest<AzureLogQueryResult>("azure.logAnalytics.query", {
          workspace: ws,
          query,
          timespan,
          maxRows,
        })
      }
      onEditInLogAnalytics={(ws, query, timespan) => {
        setLogAnalyticsPrefill({ query, timespan });
        void selectAzureLogAnalyticsWorkspace(ws).finally(() => {
          setActiveWorkspaceTabId("azure-log-analytics");
        });
      }}
      onSetMode={(resourceGroup, policyName, mode) =>
        backendRequest<WorkspaceSnapshot>("azure.waf.config.setMode", {
          resourceGroup,
          policyName,
          mode,
          confirm: true,
        }).then((workspaceResult) => {
          startTransition(() => {
            setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
          });
        })
      }
      onSetManagedRule={(
        resourceGroup,
        policyName,
        ruleSetType,
        ruleSetVersion,
        ruleGroupName,
        ruleId,
        enabled,
      ) =>
        backendRequest<WorkspaceSnapshot>("azure.waf.config.setManagedRule", {
          resourceGroup,
          policyName,
          ruleSetType,
          ruleSetVersion,
          ruleGroupName,
          ruleId,
          enabled,
          confirm: true,
        }).then((workspaceResult) => {
          startTransition(() => {
            setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
          });
        })
      }
      onRemoveExclusion={(resourceGroup, policyName, exclusion) =>
        backendRequest<WorkspaceSnapshot>("azure.waf.config.removeExclusion", {
          resourceGroup,
          policyName,
          exclusion,
          confirm: true,
        }).then((workspaceResult) => {
          startTransition(() => {
            setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
          });
        })
      }
      onAddExclusion={(resourceGroup, policyName, exclusion) =>
        backendRequest<WorkspaceSnapshot>("azure.waf.config.addExclusion", {
          resourceGroup,
          policyName,
          exclusion,
          confirm: true,
        }).then((workspaceResult) => {
          startTransition(() => {
            setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
          });
        })
      }
      onListSaved={listLogAnalyticsSaved}
      onSaveQuery={(ws, name, queryText, timespan, id) =>
        backendRequest<AzureLogAnalyticsSavedQuery>("azure.logAnalytics.saved.save", {
          workspace: ws,
          name,
          query: queryText,
          timespan,
          id,
        })
      }
      onDeleteSaved={(ws, id) =>
        backendRequest<{ deleted: boolean }>("azure.logAnalytics.saved.delete", {
          workspace: ws,
          id,
        }).then(() => undefined)
      }
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-front-door" ? (
    <AzureFrontDoorView
      workspace={activeWorkspace}
      initialTrackingReference={frontDoorAccessPrefill?.trackingReference}
      initialLogWorkspace={frontDoorAccessPrefill?.workspace}
      initialTimespan={frontDoorAccessPrefill?.timespan}
      inventoryLoading={azureServiceInventoryLoading || azureFrontDoorTopologyLoading}
      actionStatus={azureFrontDoorActionStatus}
      onRefresh={() => {
        setAzureFrontDoorActionStatus("Refreshing Front Door topology...");
        void refreshAzureFrontDoorTopology(workspace, session.selectedProfileId ?? "", { force: true });
      }}
      onPurgeCache={(profile, endpointName, contentPaths, domains) => {
        setAzureFrontDoorActionStatus(`Purging cache for ${endpointName}...`);
        void backendRequest<WorkspaceSnapshot>("azure.frontDoor.purgeCache", {
          profileName: profile,
          endpointName,
          contentPaths,
          domains,
        })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace((current) => mergeAzureFrontDoorSelection(current, workspaceResult));
            });
            setAzureFrontDoorActionStatus(
              workspaceResult.azureFrontDoorStatusMessage || `Purged cache for ${endpointName}.`,
            );
          })
          .catch((error: unknown) => {
            setAzureFrontDoorActionStatus(formatBackendError(error));
          });
      }}
      onSelectProfile={(profile) => {
        void mutateWorkspaceSelection("azure.frontDoor.selectProfile", { profile }, {
          panelLoading: true,
          merge: mergeAzureFrontDoorSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureFrontDoorProfile: profile,
                selectedAzureFrontDoorEndpoint: undefined,
                selectedAzureFrontDoorOriginGroup: undefined,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureFrontDoorProfile: profile,
                selectedAzureFrontDoorEndpoint: undefined,
                selectedAzureFrontDoorOriginGroup: undefined,
                azureFrontDoorEndpoints: [],
                azureFrontDoorOriginGroups: [],
                azureFrontDoorOrigins: [],
              }),
            );
          },
          errorTitle: "Could not select Front Door profile",
        });
      }}
      onSelectEndpoint={(endpoint) => {
        void mutateWorkspaceSelection("azure.frontDoor.selectEndpoint", { endpoint }, {
          panelLoading: true,
          merge: mergeAzureFrontDoorSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureFrontDoorEndpoint: endpoint,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureFrontDoorEndpoint: endpoint,
              }),
            );
          },
          errorTitle: "Could not select Front Door endpoint",
        });
      }}
      onSelectOriginGroup={(originGroup) => {
        void mutateWorkspaceSelection("azure.frontDoor.selectOriginGroup", { originGroup }, {
          panelLoading: true,
          merge: mergeAzureFrontDoorSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureFrontDoorOriginGroup: originGroup,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureFrontDoorOriginGroup: originGroup,
                azureFrontDoorOrigins: [],
              }),
            );
          },
          errorTitle: "Could not select Front Door origin group",
        });
      }}
      onOpenWafPolicy={(policyName) => {
        void selectAzureWafPolicy(policyName).finally(() => {
          setActiveWorkspaceTabId("azure-waf");
        });
      }}
      onEditInLogAnalytics={(ws, query, timespan) => {
        setLogAnalyticsPrefill({ query, timespan });
        void selectAzureLogAnalyticsWorkspace(ws).finally(() => {
          setActiveWorkspaceTabId("azure-log-analytics");
        });
      }}
      onRunQuery={(ws, query, timespan) =>
        backendRequest<AzureLogQueryResult>("azure.logAnalytics.query", {
          workspace: ws,
          query,
          timespan,
        })
      }
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-functions" ? (
    <AzureFunctionsView
      workspace={activeWorkspace}
      inventoryLoading={azureServiceInventoryLoading}
      onSelectApp={(appName) => {
        void mutateWorkspaceSelection("azure.functions.selectApp", { appName }, {
          panelLoading: true,
          merge: mergeAzureFunctionsSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureFunctionApp: appName,
                selectedAzureFunction: undefined,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureFunctionApp: appName,
                selectedAzureFunction: undefined,
                azureFunctions: [],
              }),
            );
          },
          errorTitle: "Could not select Function App",
        });
      }}
      onSelectFunction={(functionName) => {
        void mutateWorkspaceSelection("azure.functions.selectFunction", { functionName }, {
          persistOnly: true,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureFunction: functionName,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureFunction: functionName,
              }),
            );
          },
          errorTitle: "Could not select function",
        });
      }}
      onInvoke={(appName, functionName, payload) =>
        backendRequest<AzureFunctionInvokeResult>("azure.functions.invoke", {
          appName,
          functionName,
          payload,
        })
      }
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-key-vault" ? (
    <AzureKeyVaultView
      workspace={activeWorkspace}
      inventoryLoading={azureServiceInventoryLoading}
      onSelectVault={(vaultName) => {
        void mutateWorkspaceSelection("azure.keyVault.selectVault", { vaultName }, {
          panelLoading: true,
          merge: mergeAzureKeyVaultSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureKeyVault: vaultName,
                selectedAzureSecret: undefined,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureKeyVault: vaultName,
                selectedAzureSecret: undefined,
                azureKeyVaultSecrets: [],
              }),
            );
          },
          errorTitle: "Could not select Key Vault",
        });
      }}
      onReveal={(vaultName, secretName) =>
        backendRequest<{ value: string }>("azure.keyVault.revealSecret", { vaultName, secretName }).then(
          (result) => result.value,
        )
      }
      onSetSecret={(vaultName, secretName, value) =>
        backendRequest<WorkspaceSnapshot>("azure.keyVault.setSecret", { vaultName, secretName, value }).then(
          (workspaceResult) => {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(workspaceResult));
            });
          },
        )
      }
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-cosmos" ? (
    <AzureCosmosView
      workspace={activeWorkspace}
      inventoryLoading={azureServiceInventoryLoading}
      onSelectAccount={(account) => {
        void mutateWorkspaceSelection("azure.cosmos.selectAccount", { account }, {
          panelLoading: true,
          merge: mergeAzureCosmosSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureCosmosAccount: account,
                selectedAzureCosmosDatabase: undefined,
                selectedAzureCosmosContainer: undefined,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureCosmosAccount: account,
                selectedAzureCosmosDatabase: undefined,
                selectedAzureCosmosContainer: undefined,
                azureCosmosDatabases: [],
                azureCosmosContainers: [],
                azureCosmosItems: [],
              }),
            );
          },
          errorTitle: "Could not select Cosmos account",
        });
      }}
      onSelectDatabase={(database) => {
        void mutateWorkspaceSelection("azure.cosmos.selectDatabase", { database }, {
          panelLoading: true,
          merge: mergeAzureCosmosSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureCosmosDatabase: database,
                selectedAzureCosmosContainer: undefined,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureCosmosDatabase: database,
                selectedAzureCosmosContainer: undefined,
                azureCosmosContainers: [],
                azureCosmosItems: [],
              }),
            );
          },
          errorTitle: "Could not select Cosmos database",
        });
      }}
      onSelectContainer={(container) => {
        void mutateWorkspaceSelection("azure.cosmos.selectContainer", { container }, {
          panelLoading: true,
          merge: mergeAzureCosmosSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureCosmosContainer: container,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureCosmosContainer: container,
                azureCosmosItems: [],
              }),
            );
          },
          errorTitle: "Could not select Cosmos container",
        });
      }}
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-postgres" ? (
    <AzurePostgresView
      workspace={activeWorkspace}
      inventoryLoading={azureServiceInventoryLoading}
      onSelectServer={(server) => {
        void mutateWorkspaceSelection("azure.postgres.selectServer", { server }, {
          panelLoading: true,
          merge: mergeAzurePostgresSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzurePostgresServer: server,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzurePostgresServer: server,
                azurePostgresConnection: undefined,
              }),
            );
          },
          errorTitle: "Could not select PostgreSQL server",
        });
      }}
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-queues" ? (
    <AzureQueuesView
      workspace={activeWorkspace}
      inventoryLoading={azureServiceInventoryLoading}
      onSelectAccount={(account) => {
        void mutateWorkspaceSelection("azure.storage.selectAccount", { accountName: account }, {
          panelLoading: true,
          merge: mergeAzureQueuesSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureStorageAccount: account,
                selectedAzureQueue: undefined,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureStorageAccount: account,
                selectedAzureQueue: undefined,
                azureStorageQueues: [],
                azureQueueMessages: [],
              }),
            );
          },
          errorTitle: "Could not select storage account",
        });
      }}
      onSelectQueue={(queue) => {
        void mutateWorkspaceSelection("azure.queues.selectQueue", { queue }, {
          panelLoading: true,
          merge: mergeAzureQueuesSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureQueue: queue,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureQueue: queue,
              }),
            );
          },
          errorTitle: "Could not select queue",
        });
      }}
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-entra" ? (
    <AzureEntraView
      workspace={activeWorkspace}
      inventoryLoading={azureServiceInventoryLoading}
    />
  ) : activeWorkspaceTabId === "virtualisation" ? (
    <RuntimeView
      workspace={activeWorkspace}
      unlocked={!session.isLocked}
      showSensitiveValues={showSensitiveValues}
      onRefreshDockerRuntime={() => {
        void refreshDockerRuntime();
      }}
      localStack={{
        authToken: localStackAuthToken,
        onAuthTokenChange: setLocalStackAuthToken,
        persistence: localStackPersistence,
        onPersistenceChange: setLocalStackPersistence,
        environmentText: localStackEnvironmentText,
        onEnvironmentTextChange: setLocalStackEnvironmentText,
        logs: localStackLogs,
        logsStatus: localStackLogsStatus,
        actionStatus: localStackActionStatus,
        actionInFlight: localStackActionInFlight,
        onRefreshLogs: () => {
          void refreshLocalStackLogs();
        },
        onInvokeAction: (action) => {
          void invokeLocalStackAction(action);
        },
      }}
      flociAz={{
        persistence: flociAzPersistence,
        onPersistenceChange: setFlociAzPersistence,
        environmentText: flociAzEnvironmentText,
        onEnvironmentTextChange: setFlociAzEnvironmentText,
        logs: flociAzLogs,
        logsStatus: flociAzLogsStatus,
        actionStatus: flociAzActionStatus,
        actionInFlight: flociAzActionInFlight,
        onRefreshLogs: () => {
          void refreshFlociAzLogs();
        },
        onInvokeAction: (action) => {
          void invokeFlociAzAction(action);
        },
      }}
    />
  ) : session.isLocked && activeWorkspaceTabId !== "actions" ? (
    <PlaceholderView
      tab={session.workspaceTabs.find((tab) => tab.tabId === activeWorkspaceTabId)}
      workspace={activeWorkspace}
      showSensitiveValues={showSensitiveValues}
      onToggleSensitiveValues={() => {
        setShowSensitiveValues((current) => !current);
      }}
    />
  ) : session.isLocked ? (
    <ActivityView
      entries={toActivityEntries(logs).slice(0, 12)}
      onRefreshDiscovery={() => {
        void refreshDiscovery();
      }}
    />
  ) : (
    <ConnectView
      providers={providers}
      profiles={profiles}
      session={session}
      selectedProvider={selectedProvider}
      selectedProfile={selectedProfile}
      loading={loading}
      localRuntimeReady={workspace.dockerRuntime.reachable}
      openingProfileId={openingProfileId}
      onRefreshDiscovery={() => {
        void refreshDiscovery();
      }}
      onSelectProvider={(providerId) => {
        void mutateSession("session.selectProvider", { providerId });
      }}
      onOpenProfile={(providerId, profileId) => {
        void openWorkspace(providerId, profileId);
      }}
      onChooseAuthMethod={(authMethod) => {
        void chooseAuthMethod(authMethod);
      }}
      onOpenLocalRuntime={() => {
        setActiveWorkspaceTabId("virtualisation");
      }}
    />
  );

  const resetDialog = (
    <AlertDialog
      open={resetModalOpen}
      onOpenChange={(open) => {
        if (!open && !resetInFlight) {
          setResetModalOpen(false);
          setResetConfirmation("");
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset app data</AlertDialogTitle>
          <AlertDialogDescription>
            This clears CloudSprocket session state, activity logs, cached inventory, debug
            logs, and app-managed local runtime files. It does not touch AWS, Azure, or GCP
            config files outside the CloudSprocket app data folder.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={resetConfirmation}
          placeholder="RESET"
          aria-label="Reset confirmation"
          disabled={resetInFlight}
          onChange={(event) => {
            setResetConfirmation(event.target.value);
          }}
        />
        <AlertDialogFooter>
          <Button
            variant="ghost"
            disabled={resetInFlight}
            onClick={() => {
              setResetModalOpen(false);
              setResetConfirmation("");
            }}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={resetConfirmation !== "RESET" || resetInFlight}
            onClick={() => {
              void resetAppData();
            }}
          >
            {resetInFlight ? "Resetting..." : "Reset app"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // ---- Shell view-model derived from live state ----
  const lockedProfile = profiles.find((profile) => profile.profileId === session.lockedProfileId);
  const activeProvider = selectedProvider ?? workspace.provider;
  const emulatorCount = workspace.emulatorSummaries.length;
  const dockerReachable = workspace.dockerRuntime.reachable;
  const isLocalActive = activeWorkspaceTabId === "virtualisation";
  const isDeployActive = activeWorkspaceTabId === "deploy";
  const activeConnectionId = isDeployActive
    ? "deploy"
    : isLocalActive
      ? "local"
      : session.currentProviderId ?? null;

  const railConnections: RailConnection[] = [
    ...providers.map((provider) => {
      const lockedOnProvider =
        session.isLocked && session.lockedProviderId === provider.providerId;
      const providerProfile = lockedOnProvider
        ? profiles.find((profile) => profile.profileId === session.lockedProfileId)
        : undefined;
      const region =
        lockedOnProvider && provider.providerId === "aws"
          ? workspace.selectedEc2Region
          : undefined;
      const tooltipParts = [provider.label];
      if (lockedOnProvider && providerProfile) {
        tooltipParts.push(providerProfile.displayName);
        if (region) {
          tooltipParts.push(region);
        }
        const auth = authLabel(session.lockedAuthMethod ?? session.selectedAuthMethod);
        if (auth) {
          tooltipParts.push(auth);
        }
      } else if (provider.profileCount) {
        tooltipParts.push(
          `${provider.profileCount} profile${provider.profileCount === 1 ? "" : "s"}`,
        );
      } else if (provider.state !== "configured") {
        tooltipParts.push("Setup required");
      }
      return {
        id: provider.providerId,
        label: provider.profileCount
          ? `${provider.label} · ${provider.profileCount} profile${provider.profileCount === 1 ? "" : "s"}`
          : provider.label,
        tooltip: tooltipParts.join(" · "),
        provider: provider.providerId,
        profileBadge:
          lockedOnProvider && providerProfile
            ? profileInitials(providerProfile.displayName)
            : undefined,
        status: providerStatus(provider),
        kind: "provider" as const,
      };
    }),
    {
      id: "local",
      label: "Local Runtime",
      tooltip: dockerReachable
        ? "Local Runtime · Docker running"
        : "Local Runtime · Docker not detected",
      status: (dockerReachable ? "on" : "off") as Status,
      kind: "local" as const,
    },
    {
      id: "deploy",
      label: "Deploy",
      tooltip: "Deploy · IaC recipes",
      status: "on" as Status,
      kind: "deploy" as const,
    },
  ];

  const navConnection: NavConnectionHeader = isDeployActive
    ? {
        name: "Deploy",
        meta: "IaC recipes",
        status: "on",
        statusText: "Provision stacks with OpenTofu",
      }
    : isLocalActive
    ? {
        name: "Local Runtime",
        meta: `Docker · ${emulatorCount} emulator${emulatorCount === 1 ? "" : "s"}`,
        status: dockerReachable ? "on" : "off",
        statusText: dockerReachable ? "Docker engine running" : "Docker engine not detected",
      }
    : {
        name: session.isLocked
          ? (lockedProfile ?? selectedProfile)?.displayName ?? activeProvider?.label ?? "Workspace"
          : activeProvider?.label ?? "Getting started",
        meta: session.isLocked
          ? [activeProvider?.label, authLabel(session.lockedAuthMethod ?? session.selectedAuthMethod)]
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
    if (isDeployActive) {
      return [
        {
          label: "Deploy",
          items: [
            { id: "deploy", label: "Recipes", icon: Rocket },
            { id: "debug", label: "Debug console", icon: Bug },
          ],
        },
      ];
    }
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
        { label: "Set up", items: [{ id: "overview", label: "Connect", icon: LayoutGrid }] },
        { label: "Tools", items: [{ id: "debug", label: "Debug console", icon: Bug }] },
      ];
    }
    // Mirror the prototype's split: Overview sits under "Workspace"; the
    // provider resources sit under "Services". While the first inventory fetch
    // is in flight, swap count badges for a spinner so empty counts do not read
    // as "zero resources".
    const countsPending = workspaceFetching || (workspaceLoading && !workspaceLoaded);
    const tabCategory = (tab: WorkspaceTab): "workspace" | "service" | "tool" | "coming_soon" => {
      if (
        tab.category === "workspace" ||
        tab.category === "service" ||
        tab.category === "tool" ||
        tab.category === "coming_soon"
      ) {
        return tab.category;
      }
      if (tab.tabId === "overview" || tab.tabId === "virtualisation" || tab.tabId === "actions") {
        return "workspace";
      }
      if (
        tab.tabId === "azure-tools" ||
        tab.tabId === "azure-waf" ||
        tab.tabId === "azure-log-analytics" ||
        tab.tabId === "azure-front-door" ||
        tab.tabId === "logs"
      ) {
        return "tool";
      }
      return "service";
    };
    const entries = session.workspaceTabs.map((tab) => {
      const item = navItemForTab(tab, workspace);
      const navItem =
        countsPending && item.count != null
          ? { ...item, count: undefined, countLoading: true }
          : item;
      return { item: navItem, category: tabCategory(tab) };
    });
    const workspaceItems = entries.filter((entry) => entry.category === "workspace").map((entry) => entry.item);
    const toolItems = entries.filter((entry) => entry.category === "tool").map((entry) => entry.item);
    const serviceItems = entries
      .filter((entry) => entry.category === "service" || entry.category === "coming_soon")
      .map((entry) => entry.item);
    const groups: NavGroup[] = [];
    if (workspaceItems.length > 0) {
      groups.push({ label: "Workspace", items: workspaceItems });
    }
    if (toolItems.length > 0) {
      groups.push({ label: "Tools", items: toolItems });
    }
    if (serviceItems.length > 0) {
      groups.push({ label: "Services", items: serviceItems });
    }
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
    if (activeWorkspaceTabId === "azure-storage") {
      groups.push({
        label: "Blob storage",
        items: [
          { id: "azure-storage:accounts", label: "Accounts" },
          { id: "azure-storage:containers", label: "Containers" },
          { id: "azure-storage:blobs", label: "Blobs" },
          { id: "azure-storage:upload", label: "Upload" },
        ],
      });
    }
    groups.push({ label: "Developer", items: [{ id: "debug", label: "Debug console", icon: Bug }] });
    return groups;
  }

  const navGroups = buildNavGroups();
  const activeNavItemId =
    activeWorkspaceTabId === "s3"
      ? `s3:${activeS3PageId}`
      : activeWorkspaceTabId === "azure-storage"
        ? `azure-storage:${activeAzureStoragePageId}`
        : activeWorkspaceTabId;
  const viewLabel =
    !session.isLocked && activeWorkspaceTabId === "overview"
      ? "Connect"
      : viewLabelFor(activeWorkspaceTabId, session.workspaceTabs);
  const activityEntries = toActivityEntries(logs);

  const paletteCommands: Command[] = [
    ...railConnections.map((connection) => ({
      id: `conn:${connection.id}`,
      group: "Go to",
      label: connection.label,
      keywords: "connection provider",
      run: () => handleRailSelect(connection.id),
    })),
    ...navGroups.flatMap((group) =>
      group.items
        .filter((item) => !item.comingSoon)
        .map((item) => ({
          id: `nav:${group.label}:${item.id}`,
          group: group.label,
          label: item.label,
          run: () => handleNavSelect(item.id),
        })),
    ),
    {
      id: "act:refresh",
      group: "Actions",
      label: "Refresh discovery",
      keywords: "reload",
      run: () => {
        void refreshDiscovery();
      },
    },
    {
      id: "act:deploy",
      group: "Actions",
      label: "Deploy a recipe",
      keywords: "iac opentofu recipe",
      run: () => handleRailSelect("deploy"),
    },
    {
      id: "act:debug",
      group: "Actions",
      label: "Open debug console",
      keywords: "logs",
      run: () => setActiveWorkspaceTabId("debug"),
    },
    {
      id: "act:reset",
      group: "Actions",
      label: "Reset app data",
      keywords: "clear wipe",
      run: () => setResetModalOpen(true),
    },
  ];

  function handleRailSelect(id: string): void {
    if (id === "local") {
      setActiveWorkspaceTabId("virtualisation");
      return;
    }
    if (id === "deploy") {
      setActiveWorkspaceTabId("deploy");
      return;
    }
    if (id !== session.currentProviderId) {
      void mutateSession("session.selectProvider", { providerId: id });
    }
    setActiveWorkspaceTabId("overview");
  }

  function handleNavSelect(id: string): void {
    const comingSoonTab = session.workspaceTabs.find(
      (tab) => tab.tabId === id && tab.category === "coming_soon",
    );
    if (comingSoonTab) {
      return;
    }
    const separator = id.indexOf(":");
    if (separator >= 0) {
      const tabId = id.slice(0, separator);
      const pageId = id.slice(separator + 1);
      setActiveWorkspaceTabId(tabId);
      if (tabId === "s3") {
        setActiveS3PageId(pageId);
      } else if (tabId === "azure-overview") {
        setActiveAzurePageId(pageId);
      } else if (tabId === "azure-storage") {
        setActiveAzureStoragePageId(pageId);
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
      {resetDialog}
      <Toaster
        theme={resolvedTheme}
        position="bottom-right"
        closeButton
        richColors
        visibleToasts={4}
      />
      <AppShell
        navCollapsed={sidebarCollapsed || isTablet}
        rail={
          <ConnectionRail
            connections={railConnections}
            activeId={activeConnectionId}
            onSelect={handleRailSelect}
            menu={{
              label:
                session.isLocked && lockedProfile
                  ? profileInitials(lockedProfile.displayName)
                  : "CS",
              connectionName: navConnection.name,
              connectionDetail: navConnection.meta,
              daemonHealthy: Boolean(appSettings.localConfigDir),
              onSwitchConnection: session.isLocked
                ? () => {
                    void mutateSession("session.unlock");
                  }
                : undefined,
              onOpenDebug: () => setActiveWorkspaceTabId("debug"),
              onCopyConfigPaths: () => {
                const paths = [appSettings.localConfigDir, appSettings.emulatorStateDir]
                  .filter(Boolean)
                  .join("\n");
                if (!paths || !navigator.clipboard) {
                  notify("error", "Could not copy config paths");
                  return;
                }
                void navigator.clipboard.writeText(paths).then(
                  () => notify("success", "Config paths copied"),
                  () => notify("error", "Could not copy config paths"),
                );
              },
              onReset: () => setResetModalOpen(true),
              onOpenCommandPalette: () => setCommandPaletteOpen(true),
            }}
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
              session.isLocked ? (
                <button
                  type="button"
                  onClick={() => {
                    void mutateSession("session.unlock");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ArrowLeftRight className="size-[18px]" />
                  <span className="truncate">Switch connection</span>
                </button>
              ) : null
            }
          />
        }
        topBar={
          <TopBar
            breadcrumb={{ connection: navConnection.name, view: viewLabel }}
            onToggleNav={() => {
              setSidebarCollapsed((current) => !current);
            }}
            writeMode={
              session.isLocked &&
              (session.lockedProviderId === "aws" || session.lockedProviderId === "azure")
                ? {
                    enabled: writeModeEnabled,
                    capable: writeModeCapable,
                    endpointUrl:
                      session.lockedProviderId === "azure"
                        ? activeWorkspace.azureEndpointUrl
                        : activeWorkspace.awsEndpointUrl,
                    profileLabel: workspace.profile?.displayName ?? lockedProfile?.displayName,
                    onClick: requestWriteModeChange,
                  }
                : undefined
            }
            onRefresh={() => {
              void refreshDiscovery();
            }}
            onToggleNotifications={() => {
              const next = !notificationsOpen;
              setNotificationsOpen(next);
              if (next) {
                notifications.markAllRead();
              }
            }}
            notificationCount={notifications.unreadCount}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            loading={loading || workspaceLoading || workspaceFetching}
          />
        }
        drawer={
          <>
            <ActivityDrawer
              open={splitPanelOpen}
              onOpenChange={setSplitPanelOpen}
              title="Recent activity"
              subtitle={session.isLocked ? "Workspace" : "Discovery"}
              entries={activityEntries}
            />
            <NotificationCenter
              open={notificationsOpen}
              onOpenChange={(open) => {
                setNotificationsOpen(open);
                if (open) {
                  notifications.markAllRead();
                }
              }}
              records={notifications.records}
              onDismiss={notifications.dismiss}
              onClearAll={notifications.clearAll}
            />
          </>
        }
      >
        <div className="p-6">
          <AppErrorBoundary>
            <Suspense
              fallback={
                <p className="p-4 text-sm text-muted-foreground">Loading workspace shell...</p>
              }
            >
              {session.isLocked &&
              workspaceLoading &&
              !workspaceLoaded &&
              !NON_INVENTORY_TABS.has(activeWorkspaceTabId) ? (
                <WorkspaceSkeleton label={`${navConnection.name} inventory`} />
              ) : (
                <>
                  {session.isLocked &&
                  workspaceFetching &&
                  workspaceLoaded &&
                  !NON_INVENTORY_TABS.has(activeWorkspaceTabId) ? (
                    <InventoryLoadingState
                      variant="banner"
                      label="Refreshing inventory..."
                      className="mb-4"
                    />
                  ) : null}
                  {session.isLocked &&
                  session.lockedProviderId === "azure" &&
                  activeWorkspace.azureCliExtensions &&
                  activeWorkspace.azureCliExtensions.some((extension) => !extension.installed) ? (
                    <AzureCLIExtensionsBanner
                      extensions={activeWorkspace.azureCliExtensions}
                      className="mb-4"
                    />
                  ) : null}
                  {content}
                </>
              )}
            </Suspense>
          </AppErrorBoundary>
        </div>
      </AppShell>
      <AlertDialog open={writeModeDialogOpen} onOpenChange={setWriteModeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {writeModeDialogIntent === "incapable"
                ? "This profile cannot enable write mode"
                : "Enable write mode for this session?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                {writeModeDialogIntent === "incapable" ? (
                  <p>
                    {session.lockedProviderId === "azure"
                      ? "Write mode needs the floci-az local profile or an Azure CLI sign-in. Real cloud profiles require the CLI to be available."
                      : "Write mode needs a profile with a local endpoint_url and cloudsprocket_allow_writes = true in your AWS config. Real AWS endpoints stay read-only in this release."}
                  </p>
                ) : (
                  <>
                    <p>
                      {session.lockedProviderId === "azure"
                        ? "Mutating actions (resource group create/delete, blob upload/delete) will target the endpoint below for the rest of this locked session."
                        : "Mutating actions (S3 uploads, EC2 start/stop/reboot, Lambda invoke/create) will be sent to the endpoint below for the rest of this locked session."}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">Profile:</span>{" "}
                      {workspace.profile?.displayName || lockedProfile?.displayName || "Workspace"}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">Target:</span>{" "}
                      {session.lockedProviderId === "azure"
                        ? activeWorkspace.azureEndpointUrl || "Azure CLI"
                        : activeWorkspace.awsEndpointUrl || "Default AWS endpoint"}
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              disabled={writeModePending}
              onClick={() => setWriteModeDialogOpen(false)}
            >
              Cancel
            </Button>
            {writeModeDialogIntent === "enable" ? (
              <Button
                variant="destructive"
                disabled={writeModePending}
                onClick={() => {
                  setWriteMode(true);
                }}
              >
                {writeModePending ? "Enabling..." : "Enable writes"}
              </Button>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CommandPalette
        open={commandPaletteOpen}
        commands={paletteCommands}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </>
  );
}
