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
import { ArrowLeftRight, TriangleAlert } from "lucide-react";
import { Toaster } from "sonner";
import { useAppReset } from "./hooks/use-app-reset";
import { useAppShellNavigation } from "./hooks/use-app-shell-navigation";
import { useAwsActions } from "./hooks/use-aws-actions";
import { useAzureActions } from "./hooks/use-azure-actions";
import { useDeploymentsQuery } from "./hooks/use-deployments-query";
import { useNavigationController } from "./hooks/use-navigation-controller";
import { useRuntimeActions } from "./hooks/use-runtime-actions";
import { useServicePreferencesFlow } from "./hooks/use-service-preferences-flow";
import { useSessionState } from "./hooks/use-session-state";
import { useVirtualisationPoll } from "./hooks/use-virtualisation-poll";
import { useProviderSwitchFlow } from "./hooks/use-provider-switch-flow";
import { useWriteModeFlow } from "./hooks/use-write-mode-flow";
import { useWorkspaceLoading } from "./hooks/use-workspace-loading";
import { useWorkspaceState } from "./hooks/use-workspace-state";
import { AwsActionsProvider } from "./components/workspace/aws-actions-context";
import { AzureActionsProvider } from "./components/workspace/azure-actions-context";
import {
  WorkspaceNavigationProvider,
  type WorkspaceNavigationContextValue,
} from "./components/workspace/workspace-navigation-context";
import {
  WorkspaceSessionProvider,
  type WorkspaceSessionContextValue,
} from "./components/workspace/workspace-session-context";
import { WorkspaceTabRouter } from "./components/workspace/workspace-tab-router";
import type { WorkspaceTabRouterProps } from "./components/workspace/workspace-tab-router-props";
import { backendRequest, subscribeToBackendEvent, addDebugLog } from "./lib/backend";
import {
  normaliseWorkspaceFromUnknown,
  requestAwsInventorySlice,
  requestWorkspaceSnapshot,
} from "./lib/workspace-request";

import { awsInventoryLoaded, awsInventoryScopeForTab } from "./lib/aws-inventory";
import { azureInventoryLoaded, azureInventoryScopeForTab } from "./lib/azure-inventory";
import { deployRailBadge } from "./lib/deploy-activity";
import { cycleTabId, isTypingTarget } from "./lib/keyboard-shortcuts";
import type { NavigationLocation } from "./lib/navigation-location";
import type { NavigateToResourceParams } from "./lib/navigate-to-resource";
import { notify, notifyJob, useNotifications, type NotificationTone } from "./lib/notify";
import { selectedResourceCli } from "./lib/resource-cli";
import { indexWorkspaceResources } from "./lib/resource-search";
import { useTheme } from "./lib/theme";
import { viewLabelFor } from "./lib/workspace-shell";
import {
  AppShell,
  ConnectionRail,
  ContextNav,
  TopBar,
  ActivityDrawer,
  NotificationCenter,
} from "./components/shell";

import { AzureCLIExtensionsBanner } from "./components/azure-cli-extensions-banner";
import { CommandPalette } from "./components/command-palette";
import { InventoryLoadingState } from "./components/inventory-loading-state";
import { ShortcutCheatsheet } from "./components/shortcut-cheatsheet";
import { WorkspaceSkeleton } from "./components/workspace-skeleton";
import type {
  ActivityLogEntry,
  AppSettingsSnapshot,
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
  formatBackendError,
  frontDoorTopologyLoaded,
} from "./lib/workspace-snapshot";
import { profileInitials } from "./lib/workspace-shell";

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
    eksActionStatus,
    setEksActionStatus,
    cloudFormationActionStatus,
    setCloudFormationActionStatus,
    eventBridgeActionStatus,
    setEventBridgeActionStatus,
    route53ActionStatus,
    setRoute53ActionStatus,
    elbActionStatus,
    setElbActionStatus,
    kmsActionStatus,
    setKmsActionStatus,
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
    activeAzurePageId,
    setActiveAzurePageId,
    showSensitiveValues,
    setShowSensitiveValues,
    listLogAnalyticsHistory,
    listLogAnalyticsSaved,
    resetWorkspaceUiState,
  } = useWorkspaceState(session);
  const [activeWorkspaceTabId, setActiveWorkspaceTabId] = useState("overview");
  const pushNotification = useCallback(
    (tone: NotificationTone, header: string, content: string) => {
      notify(tone, header, content);
    },
    [],
  );
  const reloadProvidersAndProfilesRef = useRef<() => Promise<void>>(async () => undefined);
  const awsActions = useAwsActions({
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
    setS3UploadStatus,
    setSqsActionStatus,
    setSqsPeekResult,
    setSqsPeekInFlight,
    setSnsActionStatus,
    setRdsActionStatus,
    setEcsActionStatus,
    setEksActionStatus,
    setCloudFormationActionStatus,
    setEventBridgeActionStatus,
    setRoute53ActionStatus,
    setElbActionStatus,
    setKmsActionStatus,
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
  const refreshEmulatorLogsOnEnter = useCallback(async () => {
    await Promise.all([refreshLocalStackLogs(), refreshFlociAzLogs()]);
  }, [refreshFlociAzLogs, refreshLocalStackLogs]);
  useVirtualisationPoll(activeWorkspaceTabId, refreshVirtualisationState, refreshEmulatorLogsOnEnter);
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const azureInventoryFetchedScopesRef = useRef(new Set<string>());
  const awsInventoryFetchedScopesRef = useRef(new Set<string>());
  const [azureInventoryRefreshToken, setAzureInventoryRefreshToken] = useState(0);
  const [awsInventoryRefreshToken, setAwsInventoryRefreshToken] = useState(0);
  const discoveryRefreshJobIdRef = useRef<string | undefined>(undefined);
  const loadWorkspaceRef = useRef<(snapshot: SessionSnapshot) => Promise<void>>(async () => undefined);
  const [loading, setLoading] = useState(true);
  const [openingProfileId, setOpeningProfileId] = useState<string>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [splitPanelOpen, setSplitPanelOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutCheatsheetOpen, setShortcutCheatsheetOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const navigateToResourceRef = useRef<
    ((params: NavigateToResourceParams, options?: { record?: boolean }) => void) | null
  >(null);
  const deploymentsQuery = useDeploymentsQuery();
  const deployBadge = useMemo(
    () => deployRailBadge(deploymentsQuery.data ?? []),
    [deploymentsQuery.data],
  );
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

  const {
    navigateToTab,
    recordLocation,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
    recents,
    pins,
    togglePinnedTab,
  } = useNavigationController({
    activeWorkspaceTabId,
    setActiveWorkspaceTabId,
    applyResourceFocus: (params) => {
      navigateToResourceRef.current?.(params, { record: false });
    },
    labelForTab: (tabId) => viewLabelFor(tabId, session.workspaceTabs),
  });

  const navigateToLocation = useCallback(
    (location: NavigationLocation) => {
      if (location.focus) {
        navigateToResourceRef.current?.(location.focus);
        return;
      }
      navigateToTab(location.tabId);
    },
    [navigateToTab],
  );

  const lockedCloudProvider =
    session.lockedProviderId === "azure" || session.currentProviderId === "azure"
      ? "azure"
      : session.lockedProviderId === "aws" || session.currentProviderId === "aws"
        ? "aws"
        : undefined;

  const resourceHits = useMemo(
    () => (session.isLocked ? indexWorkspaceResources(workspace, lockedCloudProvider) : []),
    [lockedCloudProvider, session.isLocked, workspace],
  );

  const selectedCli = useMemo(
    () => selectedResourceCli(workspace, lockedCloudProvider, activeWorkspaceTabId),
    [activeWorkspaceTabId, lockedCloudProvider, workspace],
  );



  async function mutateSession(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<boolean> {
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
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Session mutation failed";
      pushNotification("error", `Failed to execute ${method}`, message);
      return false;
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
    /** When true, apply optimistic/result updates synchronously (avoids list flicker). */
    immediate?: boolean;
    merge?: (current: WorkspaceSnapshot, incoming: WorkspaceSnapshot) => WorkspaceSnapshot;
    onOptimistic?: () => void;
    errorTitle?: string;
  };

  async function mutateWorkspaceSelection(
    method: string,
    params: Record<string, unknown> = {},
    options: WorkspaceSelectionOptions = {},
  ): Promise<void> {
    const {
      panelLoading = false,
      persistOnly = false,
      immediate = false,
      merge,
      onOptimistic,
      errorTitle,
    } = options;
    const schedule = (update: () => void) => {
      if (immediate) {
        update();
        return;
      }
      startTransition(update);
    };
    if (onOptimistic) {
      schedule(onOptimistic);
    }
    if (panelLoading) {
      beginAzureInventoryFetch();
    }
    try {
      const workspaceResult = await requestWorkspaceSnapshot(method, params);
      if (!persistOnly) {
        schedule(() => {
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

  const azureActions = useAzureActions({
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
  const { refreshAzureFrontDoorTopology, refreshAzureWafPolicyConfig } = azureActions;

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
    void requestAwsInventorySlice(scope)
      .then((inventorySlice) => {
        startTransition(() => {
          setWorkspace((current) =>
            mergeAwsInventoryScope(current, inventorySlice),
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
        if (workspaceResult.eksStatusMessage) {
          setEksActionStatus(workspaceResult.eksStatusMessage);
        }
        if (workspaceResult.cloudFormationStatusMessage) {
          setCloudFormationActionStatus(workspaceResult.cloudFormationStatusMessage);
        }
        if (workspaceResult.eventBridgeStatusMessage) {
          setEventBridgeActionStatus(workspaceResult.eventBridgeStatusMessage);
        }
        if (workspaceResult.route53StatusMessage) {
          setRoute53ActionStatus(workspaceResult.route53StatusMessage);
        }
        if (workspaceResult.elbStatusMessage) {
          setElbActionStatus(workspaceResult.elbStatusMessage);
        }
        if (workspaceResult.kmsStatusMessage) {
          setKmsActionStatus(workspaceResult.kmsStatusMessage);
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

  const {
    preferencesSnapshot,
    setPreferencesSnapshot,
    preferencesSaving,
    hiddenResourceHits,
    setHiddenResourceHits,
    hiddenResourceEnablingServiceId,
    setHiddenResourceEnablingServiceId,
    hiddenResourcesProbeKeyRef,
    openSettings,
    loadPreferences,
    applyPreferencesUpdate,
    enableHiddenService,
  } = useServicePreferencesFlow({
    session,
    activeWorkspaceTabId,
    setActiveWorkspaceTabId,
    setProviders,
    setSession,
    loadWorkspace,
  });

  const { openResetModal, resetDialog } = useAppReset({
    resetWorkspaceUiState,
    loadState,
    pushNotification,
    clearNotifications: notifications.clearAll,
    setSession,
    setLogs,
    setPreferencesSnapshot,
    setHiddenResourceHits,
    setHiddenResourceEnablingServiceId,
    hiddenResourcesProbeKeyRef,
    setActiveWorkspaceTabId,
    setSplitPanelOpen,
    setNotificationsOpen,
  });

  const { writeModeEnabled, writeModeCapable, requestWriteModeChange, writeModeDialog } =
    useWriteModeFlow({
      session,
      activeWorkspace,
      workspace,
      lockedProfile: profiles.find((profile) => profile.profileId === session.lockedProfileId),
      setSession,
      setWorkspace,
    });

  const { requestProviderSwitch, providerSwitchDialog } = useProviderSwitchFlow({
    session,
    providers,
    profiles,
    mutateSession,
    onSwitched: () => setActiveWorkspaceTabId("overview"),
  });

  const {
    lockedProfile,
    isDeveloperToolsActive,
    activeConnectionId,
    railConnections,
    navConnection,
    navGroups,
    activeNavItemId,
    viewLabel,
    activityEntries,
    paletteCommands,
    handleRailSelect,
    handleNavSelect,
  } = useAppShellNavigation({
    session,
    profiles,
    providers,
    selectedProvider,
    selectedProfile,
    workspace,
    activeWorkspaceTabId,
    setActiveWorkspaceTabId,
    navigateToTab,
    navigateToLocation,
    setActiveAzurePageId,
    workspaceFetching,
    workspaceLoading,
    workspaceLoaded,
    logs,
    requestProviderSwitch,
    refreshDiscovery,
    openResetModal,
    deployBadge,
    recents,
    pins,
    togglePinnedTab,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    resourceHits,
    selectedCli,
    onCopyCli: (command) => {
      void navigator.clipboard.writeText(command).then(
        () => notify("success", "Copied", "CLI command copied to the clipboard."),
        () => notify("error", "Copy failed", "Could not write to the clipboard."),
      );
    },
    onOpenShortcuts: () => setShortcutCheatsheetOpen(true),
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
        return;
      }

      if (event.key === "Escape" && shortcutCheatsheetOpen) {
        event.preventDefault();
        setShortcutCheatsheetOpen(false);
        return;
      }

      // Do not steal Alt+arrows or other nav keys from text fields / open overlays.
      if (isTypingTarget(event.target) || commandPaletteOpen || shortcutCheatsheetOpen) {
        return;
      }

      if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        goBack();
        return;
      }
      if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        goForward();
        return;
      }

      if (event.key === "?" || (event.shiftKey && event.key === "/")) {
        event.preventDefault();
        setShortcutCheatsheetOpen(true);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key >= "1" && event.key <= "9") {
        const index = Number(event.key) - 1;
        const connection = railConnections[index];
        if (connection) {
          event.preventDefault();
          handleRailSelect(connection.id);
        }
        return;
      }

      if (event.key === "[" || event.key === "]") {
        const tabIds = navGroups.flatMap((group) =>
          group.items.filter((item) => !item.comingSoon).map((item) => item.id),
        );
        const next = cycleTabId(tabIds, activeWorkspaceTabId, event.key === "]" ? 1 : -1);
        if (next) {
          event.preventDefault();
          handleNavSelect(next);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeWorkspaceTabId,
    commandPaletteOpen,
    goBack,
    goForward,
    handleNavSelect,
    handleRailSelect,
    navGroups,
    railConnections,
    shortcutCheatsheetOpen,
  ]);

  const workspaceNavigation = useMemo<WorkspaceNavigationContextValue>(
    () => ({
      activeWorkspaceTabId,
      setActiveWorkspaceTabId,
      activeAzurePageId,
      setActiveAzurePageId,
      lambdaCreateFormOpen,
      setLambdaCreateFormOpen,
      logAnalyticsPrefill,
      setLogAnalyticsPrefill,
      frontDoorAccessPrefill,
      setFrontDoorAccessPrefill,
      recordLocation,
      navigateToResourceRef,
    }),
    [
      activeAzurePageId,
      activeWorkspaceTabId,
      frontDoorAccessPrefill,
      lambdaCreateFormOpen,
      logAnalyticsPrefill,
      recordLocation,
      setActiveAzurePageId,
      setActiveWorkspaceTabId,
      setFrontDoorAccessPrefill,
      setLambdaCreateFormOpen,
      setLogAnalyticsPrefill,
    ],
  );

  const workspaceSession = useMemo<WorkspaceSessionContextValue>(
    () => ({
      session,
      setSession,
      workspace,
      setWorkspace,
      activeWorkspace,
      providers,
      profiles,
      selectedProvider,
      selectedProfile,
    }),
    [
      activeWorkspace,
      profiles,
      providers,
      selectedProfile,
      selectedProvider,
      session,
      setSession,
      setWorkspace,
      workspace,
    ],
  );

  const workspaceTabRouterProps: WorkspaceTabRouterProps = {
    loading,
    openingProfileId,
    logs,
    showSensitiveValues,
    setShowSensitiveValues,
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
    dynamodbActionStatus,
    sqsActionStatus,
    sqsPeekResult,
    sqsPeekInFlight,
    snsActionStatus,
    rdsActionStatus,
    ecsActionStatus,
    eksActionStatus,
    cloudFormationActionStatus,
    eventBridgeActionStatus,
    route53ActionStatus,
    elbActionStatus,
    kmsActionStatus,
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
    mutateWorkspaceSelection,
    mutateSession,
    refreshDiscovery,
    refreshDockerRuntime,
    refreshLocalStackLogs,
    refreshFlociAzLogs,
    listLogAnalyticsHistory,
    listLogAnalyticsSaved,
    invokeLocalStackAction,
    invokeFlociAzAction,
    openWorkspace,
    chooseAuthMethod,
    preferencesSnapshot,
    preferencesSaving,
    onLoadPreferences: loadPreferences,
    onPreferencesUpdate: applyPreferencesUpdate,
    hiddenResourceHits,
    hiddenResourceEnablingServiceId,
    onEnableHiddenService: enableHiddenService,
  };

  const content = (
    <WorkspaceSessionProvider value={workspaceSession}>
      <WorkspaceNavigationProvider value={workspaceNavigation}>
        <AwsActionsProvider value={awsActions}>
          <AzureActionsProvider value={azureActions}>
            <WorkspaceTabRouter {...workspaceTabRouterProps} />
          </AzureActionsProvider>
        </AwsActionsProvider>
      </WorkspaceNavigationProvider>
    </WorkspaceSessionProvider>
  );

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
              onReset: openResetModal,
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
              (session.lockedProviderId === "aws" ||
                session.lockedProviderId === "azure" ||
                session.lockedProviderId === "gcp")
                ? {
                    enabled: writeModeEnabled,
                    capable: writeModeCapable,
                    endpointUrl:
                      session.lockedProviderId === "azure"
                        ? activeWorkspace.azureEndpointUrl
                        : session.lockedProviderId === "gcp"
                          ? activeWorkspace.profile?.attributes.find(
                              (field) => field.label.toLowerCase() === "project",
                            )?.value
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
      {writeModeDialog}
      {providerSwitchDialog}

      <CommandPalette
        open={commandPaletteOpen}
        commands={paletteCommands}
        onClose={() => setCommandPaletteOpen(false)}
      />
      <ShortcutCheatsheet
        open={shortcutCheatsheetOpen}
        onClose={() => setShortcutCheatsheetOpen(false)}
      />
    </>
  );
}
