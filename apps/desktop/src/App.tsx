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
import { useAwsActions } from "./hooks/use-aws-actions";
import { useAzureActions } from "./hooks/use-azure-actions";
import { useRuntimeActions } from "./hooks/use-runtime-actions";
import { useSessionState } from "./hooks/use-session-state";
import { useVirtualisationPoll } from "./hooks/use-virtualisation-poll";
import { useWorkspaceLoading } from "./hooks/use-workspace-loading";
import { useWorkspaceState } from "./hooks/use-workspace-state";
import { WorkspaceTabRouter } from "./components/workspace/workspace-tab-router";
import type { WorkspaceTabRouterProps } from "./components/workspace/workspace-tab-router-props";
import { backendRequest, subscribeToBackendEvent, addDebugLog, clearDebugLogs } from "./lib/backend";
import { normalisePreferencesSnapshot, toggleService } from "./lib/service-preferences";
import { normaliseWorkspaceFromUnknown, requestWorkspaceSnapshot } from "./lib/workspace-request";

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
import { AzureCLIExtensionsBanner } from "./components/azure-cli-extensions-banner";
import { CommandPalette, type Command } from "./components/command-palette";
import { InventoryLoadingState } from "./components/inventory-loading-state";
import { WorkspaceSkeleton } from "./components/workspace-skeleton";
import type {
  ActivityLogEntry,
  AppResetResult,
  AppSettingsSnapshot,
  HiddenResourceHit,
  HiddenResourcesSnapshot,
  PreferencesSnapshot,
  ServicePreferences,
  AuthMethod,
  AuthMethodStatus,
  AwsDynamoDBTable,
  AwsEc2Instance,
  AwsLambdaFunction,
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
  AzureLogAnalyticsTableInfo,
  AzureLogQueryResult,
  AzureWafLogSchemaProfile,
  AzureFunctionInvokeResult,
  DetailField,
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
} from "./lib/workspace-shell";

export default function App() {
  const {
    providers,
    setProviders,
    profiles,
    setProfiles,
    session,
    setSession,
    appSettings,
    setAppSettings,
    sessionSnapshotRef,
    selectedProvider,
    selectedProfile,
  } = useSessionState();
  const {
    workspaceLoading,
    workspaceFetching,
    workspaceLoaded,
    setWorkspaceLoaded,
    azureInventoryLoading,
    awsInventoryLoading,
    beginWorkspaceFetch,
    endWorkspaceFetch,
    resetWorkspaceFetch,
    beginAzureInventoryFetch,
    endAzureInventoryFetch,
    beginAwsInventoryFetch,
    endAwsInventoryFetch,
  } = useWorkspaceLoading();
  const {
    workspace,
    setWorkspace,
    activeWorkspace,
    azureLogWorkspaceSelectionLoading,
    setAzureLogWorkspaceSelectionLoading,
    azureLogWorkspaceSelectionRequest,
    s3UploadStatus,
    setS3UploadStatus,
    s3SignedUrlStatus,
    setS3SignedUrlStatus,
    s3SignedUrlResult,
    setS3SignedUrlResult,
    s3UrlInspection,
    setS3UrlInspection,
    s3UrlValidation,
    ec2ActionStatus,
    setEC2ActionStatus,
    ec2ActionInFlight,
    setEC2ActionInFlight,
    ec2ActionHistory,
    setEC2ActionHistory,
    lambdaActionStatus,
    setLambdaActionStatus,
    lambdaInvokeResult,
    setLambdaInvokeResult,
    lambdaInvokeInFlight,
    setLambdaInvokeInFlight,
    lambdaCreateInFlight,
    setLambdaCreateInFlight,
    lambdaCreateFormOpen,
    setLambdaCreateFormOpen,
    dynamodbActionStatus,
    setDynamodbActionStatus,
    sqsActionStatus,
    setSqsActionStatus,
    sqsPeekResult,
    setSqsPeekResult,
    sqsPeekInFlight,
    setSqsPeekInFlight,
    snsActionStatus,
    setSnsActionStatus,
    rdsActionStatus,
    setRdsActionStatus,
    ecsActionStatus,
    setEcsActionStatus,
    apiGatewayActionStatus,
    setApiGatewayActionStatus,
    secretsManagerActionStatus,
    setSecretsManagerActionStatus,
    logsActionStatus,
    setLogsActionStatus,
    iamActionStatus,
    setIamActionStatus,
    azureActionStatus,
    setAzureActionStatus,
    azureStorageActionStatus,
    setAzureStorageActionStatus,
    azureAppServiceActionStatus,
    setAzureAppServiceActionStatus,
    azureFrontDoorActionStatus,
    setAzureFrontDoorActionStatus,
    azureFrontDoorTopologyLoading,
    setAzureFrontDoorTopologyLoading,
    azureWafConfigLoading,
    setAzureWafConfigLoading,
    frontDoorRefreshInFlightRef,
    wafRefreshInFlightRef,
    s3PrefixRequestIdRef,
    localStackAuthToken,
    setLocalStackAuthToken,
    localStackPersistence,
    setLocalStackPersistence,
    localStackEnvironmentText,
    setLocalStackEnvironmentText,
    localStackLogs,
    setLocalStackLogs,
    localStackLogsStatus,
    setLocalStackLogsStatus,
    localStackActionStatus,
    setLocalStackActionStatus,
    localStackActionInFlight,
    setLocalStackActionInFlight,
    flociAzPersistence,
    setFlociAzPersistence,
    flociAzEnvironmentText,
    setFlociAzEnvironmentText,
    flociAzLogs,
    setFlociAzLogs,
    flociAzLogsStatus,
    setFlociAzLogsStatus,
    flociAzActionStatus,
    setFlociAzActionInFlight,
    flociAzActionInFlight,
    setFlociAzActionStatus,
    frontDoorAccessPrefill,
    setFrontDoorAccessPrefill,
    logAnalyticsPrefill,
    setLogAnalyticsPrefill,
    activeS3PageId,
    setActiveS3PageId,
    activeAzurePageId,
    setActiveAzurePageId,
    activeAzureStoragePageId,
    setActiveAzureStoragePageId,
    showSensitiveValues,
    setShowSensitiveValues,
    listLogAnalyticsHistory,
    listLogAnalyticsSaved,
    resetWorkspaceUiState,
  } = useWorkspaceState(session);
  const [activeWorkspaceTabId, setActiveWorkspaceTabId] = useState("overview");
  const [preferencesSnapshot, setPreferencesSnapshot] = useState<PreferencesSnapshot | null>(null);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [hiddenResourceHits, setHiddenResourceHits] = useState<HiddenResourceHit[]>([]);
  const [hiddenResourceEnablingServiceId, setHiddenResourceEnablingServiceId] = useState<
    string | null
  >(null);
  const hiddenResourcesProbeKeyRef = useRef<string | null>(null);
  const pushNotification = useCallback(
    (tone: NotificationTone, header: string, content: string) => {
      notify(tone, header, content);
    },
    [],
  );
  const reloadProvidersAndProfilesRef = useRef<() => Promise<void>>(async () => undefined);
  const {
    refreshEC2Inventory,
    selectEC2Region,
    selectEC2Instance,
    invokeEC2LifecycleAction,
    refreshLambdaInventory,
    selectLambdaRegion,
    selectLambdaFunction,
    invokeLambda,
    createLambda,
    refreshDynamoDBInventory,
    selectDynamoDBRegion,
    selectDynamoDBTable,
    putDynamoDBItem,
    deleteDynamoDBItem,
    refreshSQSInventory,
    selectSQSRegion,
    selectSQSQueue,
    peekSQSQueue,
    sendSQSMessage,
    createSQSQueue,
    refreshSNSInventory,
    selectSNSRegion,
    selectSNSTopic,
    publishSNSTopic,
    createSNSTopic,
    refreshRDSInventory,
    selectRDSRegion,
    selectRDSInstance,
    refreshECSInventory,
    selectECSRegion,
    selectECSCluster,
    selectECSService,
    selectECSTask,
    refreshApiGatewayInventory,
    selectApiGatewayRegion,
    selectApiGatewayApi,
    refreshSecretsManagerInventory,
    selectSecretsManagerRegion,
    selectSecretsManagerSecret,
    refreshLogsInventory,
    selectLogsRegion,
    selectLogGroup,
    refreshIAMInventory,
    selectIAMRole,
    applyS3PrefixFilter,
  } = useAwsActions({
    workspace,
    setWorkspace,
    s3PrefixRequestIdRef,
    lambdaInvokeInFlight,
    lambdaCreateInFlight,
    setEC2ActionStatus,
    setEC2ActionInFlight,
    setLambdaActionStatus,
    setLambdaInvokeResult,
    setLambdaInvokeInFlight,
    setLambdaCreateInFlight,
    setDynamodbActionStatus,
    setSqsActionStatus,
    setSqsPeekResult,
    setSqsPeekInFlight,
    setSnsActionStatus,
    setRdsActionStatus,
    setEcsActionStatus,
    setApiGatewayActionStatus,
    setSecretsManagerActionStatus,
    setLogsActionStatus,
    setIamActionStatus,
  });
  const {
    refreshDockerRuntime,
    refreshVirtualisationState,
    refreshLocalStackLogs,
    refreshFlociAzLogs,
    invokeLocalStackAction,
    invokeFlociAzAction,
  } = useRuntimeActions({
    setWorkspace,
    setLocalStackLogs,
    setLocalStackLogsStatus,
    setLocalStackActionStatus,
    setLocalStackActionInFlight,
    localStackAuthToken,
    localStackPersistence,
    localStackEnvironmentText,
    setFlociAzLogs,
    setFlociAzLogsStatus,
    setFlociAzActionStatus,
    setFlociAzActionInFlight,
    flociAzPersistence,
    flociAzEnvironmentText,
    setActiveWorkspaceTabId,
    reloadProvidersAndProfiles: () => reloadProvidersAndProfilesRef.current(),
  });
  useVirtualisationPoll(activeWorkspaceTabId, refreshVirtualisationState);
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const azureInventoryFetchedScopesRef = useRef(new Set<string>());
  const awsInventoryFetchedScopesRef = useRef(new Set<string>());
  const [azureInventoryRefreshToken, setAzureInventoryRefreshToken] = useState(0);
  const [awsInventoryRefreshToken, setAwsInventoryRefreshToken] = useState(0);
  const discoveryRefreshJobIdRef = useRef<string | undefined>(undefined);
  const loadWorkspaceRef = useRef<(snapshot: SessionSnapshot) => Promise<void>>(async () => undefined);
  const [writeModeDialogOpen, setWriteModeDialogOpen] = useState(false);
  const [writeModeDialogIntent, setWriteModeDialogIntent] = useState<"enable" | "incapable">("enable");
  const [writeModePending, setWriteModePending] = useState(false);
  const writeModeRequestRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [openingProfileId, setOpeningProfileId] = useState<string>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [splitPanelOpen, setSplitPanelOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetInFlight, setResetInFlight] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const { resolvedTheme } = useTheme();
  const notifications = useNotifications();

  const isInitialLoad = useRef(true);
  const isTablet = viewportWidth < 1180;

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

          const workspaceResult = normaliseWorkspaceFromUnknown(job.result);
          if (workspaceResult) {
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
      activeWorkspaceTabId !== "developer-tools" &&
      activeWorkspaceTabId !== "settings" &&
      activeWorkspaceTabId !== "deploy" &&
      !session.workspaceTabs.some((tab) => tab.tabId === activeWorkspaceTabId)
    ) {
      setActiveWorkspaceTabId("overview");
    }
  }, [activeWorkspaceTabId, session.isLocked, session.workspaceTabs]);

  useEffect(() => {
    if (!session.isLocked) {
      setHiddenResourceHits([]);
      hiddenResourcesProbeKeyRef.current = null;
      return;
    }
    void probeHiddenResources();
  }, [session.isLocked, session.lockedProviderId, session.lockedProfileId]);

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
      const workspaceResult = await requestWorkspaceSnapshot(method, params);
      if (!persistOnly) {
        startTransition(() => {
          setWorkspace((current) =>
            merge ? merge(current, workspaceResult) : workspaceResult,
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

  const {
    selectAzureWebAppSlot,
    selectAzureWebApp,
    selectAzureVirtualMachine,
    selectAzureResourceGroup,
    refreshAzureFrontDoorTopology,
    refreshAzureWafPolicyConfig,
    selectAzureWafPolicy,
    selectAzureLogAnalyticsWorkspace,
  } = useAzureActions({
    workspace,
    setWorkspace,
    setSession,
    beginAzureInventoryFetch,
    endAzureInventoryFetch,
    pushNotification,
    frontDoorRefreshInFlightRef,
    wafRefreshInFlightRef,
    azureLogWorkspaceSelectionRequest,
    setAzureLogWorkspaceSelectionLoading,
    setAzureFrontDoorTopologyLoading,
    setAzureWafConfigLoading,
    setAzureFrontDoorActionStatus,
  });

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
    void requestWorkspaceSnapshot("azure.inventory.get", { scope })
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
    void requestWorkspaceSnapshot("aws.inventory.get", { scope })
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
        resetWorkspaceUiState();
        setLogs([]);
        setPreferencesSnapshot(null);
        setHiddenResourceHits([]);
        setHiddenResourceEnablingServiceId(null);
        hiddenResourcesProbeKeyRef.current = null;
        setActiveWorkspaceTabId("overview");
        setSplitPanelOpen(false);
        setNotificationsOpen(false);
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
      const workspaceResult = await requestWorkspaceSnapshot("workspace.get");
      startTransition(() => {
        setWorkspace(workspaceResult);
        setWorkspaceLoaded(true);
        if (!lambdaInvokeInFlight && workspaceResult.lambdaStatusMessage) {
          setLambdaActionStatus(workspaceResult.lambdaStatusMessage);
        }
        if (workspaceResult.dynamodbStatusMessage) {
          setDynamodbActionStatus(workspaceResult.dynamodbStatusMessage);
        }
        if (!sqsPeekInFlight && workspaceResult.sqsStatusMessage) {
          setSqsActionStatus(workspaceResult.sqsStatusMessage);
        }
        if (workspaceResult.snsStatusMessage) {
          setSnsActionStatus(workspaceResult.snsStatusMessage);
        }
        if (workspaceResult.rdsStatusMessage) {
          setRdsActionStatus(workspaceResult.rdsStatusMessage);
        }
        if (workspaceResult.ecsStatusMessage) {
          setEcsActionStatus(workspaceResult.ecsStatusMessage);
        }
        if (workspaceResult.apiGatewayStatusMessage) {
          setApiGatewayActionStatus(workspaceResult.apiGatewayStatusMessage);
        }
        if (workspaceResult.secretsManagerStatusMessage) {
          setSecretsManagerActionStatus(workspaceResult.secretsManagerStatusMessage);
        }
        if (workspaceResult.logsStatusMessage) {
          setLogsActionStatus(workspaceResult.logsStatusMessage);
        }
        if (workspaceResult.iamStatusMessage) {
          setIamActionStatus(workspaceResult.iamStatusMessage);
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
  reloadProvidersAndProfilesRef.current = reloadProvidersAndProfiles;

  async function probeHiddenResources(force = false): Promise<void> {
    if (!session.isLocked) {
      setHiddenResourceHits([]);
      hiddenResourcesProbeKeyRef.current = null;
      return;
    }
    const probeKey = `${session.lockedProviderId}:${session.lockedProfileId}`;
    if (!force && hiddenResourcesProbeKeyRef.current === probeKey) {
      return;
    }
    try {
      const snapshot = await backendRequest<HiddenResourcesSnapshot>(
        "preferences.hiddenResources.get",
      );
      setHiddenResourceHits(snapshot.hits ?? []);
      hiddenResourcesProbeKeyRef.current = probeKey;
    } catch {
      setHiddenResourceHits([]);
    }
  }

  async function openSettings(): Promise<void> {
    const [snapshot] = await Promise.all([
      backendRequest<PreferencesSnapshot>("preferences.get"),
      probeHiddenResources(true),
    ]);
    setPreferencesSnapshot(normalisePreferencesSnapshot(snapshot));
    setActiveWorkspaceTabId("settings");
  }

  async function applyPreferencesUpdate(preferences: ServicePreferences): Promise<void> {
    setPreferencesSaving(true);
    try {
      const snapshot = await backendRequest<PreferencesSnapshot>(
        "preferences.update",
        preferences as unknown as Record<string, unknown>,
      );
      setPreferencesSnapshot(normalisePreferencesSnapshot(snapshot));
      const [providersResult, sessionResult] = await Promise.all([
        backendRequest<ProviderSummary[]>("providers.list"),
        backendRequest<SessionSnapshot>("session.get"),
      ]);
      setProviders(normaliseArray(providersResult).map(normaliseProvider));
      const normalisedSession = normaliseSessionSnapshot(sessionResult);
      setSession(normalisedSession);
      if (
        normalisedSession.isLocked &&
        activeWorkspaceTabId !== "settings" &&
        activeWorkspaceTabId !== "debug" &&
        activeWorkspaceTabId !== "developer-tools" &&
        activeWorkspaceTabId !== "deploy" &&
        activeWorkspaceTabId !== "virtualisation" &&
        !normalisedSession.workspaceTabs.some((tab) => tab.tabId === activeWorkspaceTabId)
      ) {
        setActiveWorkspaceTabId("overview");
      }
      await loadWorkspace(normalisedSession);
      void probeHiddenResources(true);
    } finally {
      setPreferencesSaving(false);
    }
  }

  async function enableHiddenService(hit: HiddenResourceHit): Promise<void> {
    setHiddenResourceEnablingServiceId(hit.serviceId);
    try {
      const snapshot =
        preferencesSnapshot ??
        (await backendRequest<PreferencesSnapshot>("preferences.get"));
      if (!preferencesSnapshot) {
        setPreferencesSnapshot(normalisePreferencesSnapshot(snapshot));
      }
      const nextPreferences = toggleService(
        snapshot.preferences,
        hit.providerId,
        hit.serviceId,
        true,
      );
      await applyPreferencesUpdate(nextPreferences);
    } finally {
      setHiddenResourceEnablingServiceId(null);
    }
  }

  const workspaceTabRouterProps: WorkspaceTabRouterProps = {
    activeWorkspaceTabId,
    setActiveWorkspaceTabId,
    session,
    activeWorkspace,
    workspace,
    selectedProvider,
    selectedProfile,
    profiles,
    providers,
    loading,
    openingProfileId,
    logs,
    showSensitiveValues,
    setShowSensitiveValues,
    activeS3PageId,
    setActiveS3PageId,
    activeAzurePageId,
    activeAzureStoragePageId,
    s3UploadStatus,
    setS3UploadStatus,
    s3SignedUrlStatus,
    setS3SignedUrlStatus,
    s3SignedUrlResult,
    s3UrlInspection,
    setS3UrlInspection,
    s3UrlValidation,
    ec2ActionStatus,
    ec2ActionInFlight,
    ec2ActionHistory,
    lambdaActionStatus,
    lambdaInvokeResult,
    lambdaInvokeInFlight,
    lambdaCreateInFlight,
    lambdaCreateFormOpen,
    setLambdaCreateFormOpen,
    dynamodbActionStatus,
    sqsActionStatus,
    sqsPeekResult,
    sqsPeekInFlight,
    snsActionStatus,
    rdsActionStatus,
    ecsActionStatus,
    apiGatewayActionStatus,
    secretsManagerActionStatus,
    logsActionStatus,
    iamActionStatus,
    azureActionStatus,
    setAzureActionStatus,
    azureStorageActionStatus,
    setAzureStorageActionStatus,
    azureAppServiceActionStatus,
    setAzureAppServiceActionStatus,
    azureFrontDoorActionStatus,
    setAzureFrontDoorActionStatus,
    azureServiceInventoryLoading,
    azureLogWorkspaceSelectionLoading,
    azureWafConfigLoading,
    azureFrontDoorTopologyLoading,
    logAnalyticsPrefill,
    setLogAnalyticsPrefill,
    frontDoorAccessPrefill,
    setFrontDoorAccessPrefill,
    localStackAuthToken,
    setLocalStackAuthToken,
    localStackPersistence,
    setLocalStackPersistence,
    localStackEnvironmentText,
    setLocalStackEnvironmentText,
    localStackLogs,
    localStackLogsStatus,
    localStackActionStatus,
    localStackActionInFlight,
    flociAzPersistence,
    setFlociAzPersistence,
    flociAzEnvironmentText,
    setFlociAzEnvironmentText,
    flociAzLogs,
    flociAzLogsStatus,
    flociAzActionStatus,
    flociAzActionInFlight,
    setWorkspace,
    setSession,
    mutateWorkspaceSelection,
    mutateSession,
    refreshDiscovery,
    refreshDockerRuntime,
    refreshLocalStackLogs,
    refreshFlociAzLogs,
    refreshEC2Inventory,
    selectEC2Region,
    selectEC2Instance,
    invokeEC2LifecycleAction,
    refreshLambdaInventory,
    selectLambdaRegion,
    selectLambdaFunction,
    invokeLambda,
    createLambda,
    refreshDynamoDBInventory,
    selectDynamoDBRegion,
    selectDynamoDBTable,
    putDynamoDBItem,
    deleteDynamoDBItem,
    refreshSQSInventory,
    selectSQSRegion,
    selectSQSQueue,
    peekSQSQueue,
    sendSQSMessage,
    createSQSQueue,
    refreshSNSInventory,
    selectSNSRegion,
    selectSNSTopic,
    publishSNSTopic,
    createSNSTopic,
    refreshRDSInventory,
    selectRDSRegion,
    selectRDSInstance,
    refreshECSInventory,
    selectECSRegion,
    selectECSCluster,
    selectECSService,
    selectECSTask,
    refreshApiGatewayInventory,
    selectApiGatewayRegion,
    selectApiGatewayApi,
    refreshSecretsManagerInventory,
    selectSecretsManagerRegion,
    selectSecretsManagerSecret,
    refreshLogsInventory,
    selectLogsRegion,
    selectLogGroup,
    refreshIAMInventory,
    selectIAMRole,
    applyS3PrefixFilter,
    selectAzureResourceGroup,
    selectAzureVirtualMachine,
    selectAzureWebApp,
    selectAzureWebAppSlot,
    selectAzureLogAnalyticsWorkspace,
    selectAzureWafPolicy,
    refreshAzureFrontDoorTopology,
    listLogAnalyticsHistory,
    listLogAnalyticsSaved,
    invokeLocalStackAction,
    invokeFlociAzAction,
    openWorkspace,
    chooseAuthMethod,
    preferencesSnapshot,
    preferencesSaving,
    onPreferencesUpdate: applyPreferencesUpdate,
    hiddenResourceHits,
    hiddenResourceEnablingServiceId,
    onEnableHiddenService: enableHiddenService,
  };

  const content = <WorkspaceTabRouter {...workspaceTabRouterProps} />;


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
  const isDeveloperToolsActive = activeWorkspaceTabId === "developer-tools";
  const activeConnectionId = isDeployActive
    ? "deploy"
    : isLocalActive
      ? "local"
      : isDeveloperToolsActive
        ? "developer-tools"
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
      id: "developer-tools",
      label: "Developer Toolbox",
      tooltip: "Developer Toolbox · JSON, YAML, diff, encoders",
      status: "on" as Status,
      kind: "tools" as const,
    },
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
    : isDeveloperToolsActive
      ? {
          name: "Developer Toolbox",
          meta: "Local utilities",
          status: "on",
          statusText: "Private scratch tools — nothing leaves this app",
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
    if (isDeveloperToolsActive) {
      return [
        {
          label: "Developer",
          items: [{ id: "debug", label: "Debug console", icon: Bug }],
        },
      ];
    }
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
    groups.push({
      label: "Developer",
      items: [{ id: "debug", label: "Debug console", icon: Bug }],
    });
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
    activeWorkspaceTabId === "settings"
      ? "Services"
      : !session.isLocked && activeWorkspaceTabId === "overview"
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
      id: "act:developer-tools",
      group: "Actions",
      label: "Open developer toolbox",
      keywords: "json yaml diff encode arn azure resource id jwt",
      run: () => setActiveWorkspaceTabId("developer-tools"),
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
    if (id === "developer-tools") {
      setActiveWorkspaceTabId("developer-tools");
      return;
    }
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
        navCollapsed={sidebarCollapsed || isTablet || isDeveloperToolsActive}
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
              onOpenSettings: () => {
                void openSettings();
              },
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
