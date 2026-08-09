// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { startTransition, useEffect, useState, type ReactNode } from "react";
import { backendRequest } from "@/lib/backend";
import { notify } from "@/lib/notify";
import { overviewNavigateToParams, resolveOverviewProvider } from "@/lib/navigate-to-resource";
import { formatBackendError, normaliseWorkspaceSnapshot } from "@/lib/workspace-snapshot";
import { toActivityEntries } from "@/lib/workspace-shell";
import { useNavigateToResource } from "@/hooks/use-navigate-to-resource";
import type {
  GcpCloudFunctionInvokeResult,
  GcpStorageSignUrlResult,
  WorkspaceSnapshot,
} from "@/types/backend";
import ConnectView from "@/views/ConnectView";
import OverviewView from "@/views/OverviewView";
import DeployView from "@/views/deploy/DeployView";
import OnboardingWizard from "@/views/onboarding/OnboardingWizard";
import {
  FIRST_LAB_RECIPE_ID,
  isOnboardingComplete,
  markOnboardingComplete,
} from "@/views/onboarding/onboarding-state";
import DebugView from "@/views/DebugView";
import {
  ActivityView,
  RuntimeView,
  PlaceholderView,
  DeveloperToolsView,
  GcpStorageView,
  GcpComputeView,
  GcpFunctionsView,
  GcpGkeView,
} from "@/views/workspace/lazy-views";
import SettingsView from "@/views/SettingsView";
import { AwsWorkspaceTabs, AWS_TAB_IDS } from "./aws-workspace-tabs";
import { AzureWorkspaceTabs } from "./azure-workspace-tabs";
import { useAwsActionsContext } from "./aws-actions-context";
import { useAzureActionsContext } from "./azure-actions-context";
import { useRuntimeEmulatorContext } from "./runtime-emulator-context";
import { useWorkspaceNavigationContext } from "./workspace-navigation-context";
import { useWorkspaceSessionContext } from "./workspace-session-context";
import type { WorkspaceTabRouterProps } from "./workspace-tab-router-props";

export function WorkspaceTabRouter(props: WorkspaceTabRouterProps): ReactNode {
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingComplete());
  const [deployRecipeId, setDeployRecipeId] = useState<string>();
  const [gcpSignedUrlResult, setGcpSignedUrlResult] = useState<GcpStorageSignUrlResult | undefined>();
  const [gcpSignedUrlStatus, setGcpSignedUrlStatus] = useState("");
  const {
    activeWorkspaceTabId,
    setActiveWorkspaceTabId,
    setActiveAzurePageId,
    setLambdaCreateFormOpen,
    recordLocation,
    navigateToResourceRef,
  } = useWorkspaceNavigationContext();
  const {
    session,
    activeWorkspace,
    workspace,
    selectedProvider,
    selectedProfile,
    profiles,
    providers,
    setWorkspace,
  } = useWorkspaceSessionContext();
  const {
    loading,
    openingProfileId,
    logs,
    showSensitiveValues,
    setShowSensitiveValues,
    azureServiceInventoryLoading,
    azureLogWorkspaceSelectionLoading,
    azureWafConfigLoading,
    azureFrontDoorTopologyLoading,
    mutateWorkspaceSelection,
    mutateSession,
    refreshDiscovery,
    listLogAnalyticsHistory,
    listLogAnalyticsSaved,
    openWorkspace,
    chooseAuthMethod,
  } = props;

  const {
    localStack,
    flociAz,
    refreshDockerRuntime,
  } = useRuntimeEmulatorContext();

  const {
    selectLambdaFunction,
    selectDynamoDBTable,
    selectSQSQueue,
    selectSNSTopic,
    selectRDSInstance,
    selectLogGroup,
    selectLogsRegion,
    selectIAMRole,
    selectEC2Instance,
  } = useAwsActionsContext();
  const { selectAzureResourceGroup, selectAzureVirtualMachine } = useAzureActionsContext();

  const navigateToResource = useNavigateToResource({
    setActiveWorkspaceTabId,
    setActiveAzurePageId,
    setLambdaCreateFormOpen,
    mutateWorkspaceSelection,
    setWorkspace,
    selectLambdaFunction,
    selectDynamoDBTable,
    selectSQSQueue,
    selectSNSTopic,
    selectRDSInstance,
    selectLogGroup,
    selectLogsRegion,
    selectIAMRole,
    selectEC2Instance,
    selectAzureResourceGroup,
    selectAzureVirtualMachine,
    recordLocation,
  });

  // Expose deep-link navigation to the shell (palette resource search, history).
  useEffect(() => {
    if (navigateToResourceRef) {
      navigateToResourceRef.current = navigateToResource;
    }
  }, [navigateToResource, navigateToResourceRef]);

  if (activeWorkspaceTabId === "debug") {
    return <DebugView />;
  }
  if (activeWorkspaceTabId === "developer-tools") {
    return <DeveloperToolsView />;
  }
  if (activeWorkspaceTabId === "settings" && props.preferencesSnapshot) {
    return (
      <SettingsView
        snapshot={props.preferencesSnapshot}
        saving={props.preferencesSaving}
        onUpdate={(preferences) => {
          void props.onPreferencesUpdate(preferences);
        }}
      />
    );
  }
  if (activeWorkspaceTabId === "deploy") {
    return (
      <DeployView
        profiles={profiles}
        navigateToResource={navigateToResource}
        initialRecipeId={deployRecipeId}
        onInitialRecipeOpened={() => setDeployRecipeId(undefined)}
      />
    );
  }
  if (session.isLocked && activeWorkspaceTabId === "overview") {
    return (
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
            void localStack.invokeAction("start");
            return;
          }
          void flociAz.invokeAction("start");
        }}
        runtimeActionInFlight={{
          localstack: localStack.actionInFlight,
          "floci-az": flociAz.actionInFlight,
        }}
        hiddenResourceHits={props.hiddenResourceHits}
        hiddenResourceEnablingServiceId={props.hiddenResourceEnablingServiceId}
        onEnableHiddenService={(hit) => {
          void props.onEnableHiddenService(hit);
        }}
        onNavigate={(tabId, context) => {
          const provider = resolveOverviewProvider(tabId, {
            lockedProviderId: session.lockedProviderId,
            workspaceProviderId: workspace.provider?.providerId,
            selectedProviderId: selectedProvider?.providerId,
          });
          navigateToResource(overviewNavigateToParams(tabId, context, provider));
        }}
      />
    );
  }

  if (session.isLocked && AWS_TAB_IDS.has(activeWorkspaceTabId)) {
    return <AwsWorkspaceTabs {...props} navigateToResource={navigateToResource} />;
  }

  if (session.isLocked && ["azure-overview","azure-resource-groups","azure-vms","azure-storage","azure-app-service","azure-tools","azure-log-analytics","azure-waf","azure-front-door","azure-functions","azure-key-vault","azure-cosmos","azure-postgres","azure-queues","azure-entra"].includes(activeWorkspaceTabId)) {
    return <AzureWorkspaceTabs {...props} />;
  }

  if (session.isLocked && activeWorkspaceTabId === "gcp-storage") {
    return (
      <GcpStorageView
        workspace={activeWorkspace}
        signedUrlResult={gcpSignedUrlResult}
        signedUrlStatus={gcpSignedUrlStatus}
        onRefresh={() => {
          void refreshDiscovery();
        }}
        onSelectBucket={(bucketName) => {
          setGcpSignedUrlResult(undefined);
          setGcpSignedUrlStatus("");
          void mutateWorkspaceSelection("gcp.storage.selectBucket", { bucketName }, {
            immediate: true,
            errorTitle: "Failed to select Cloud Storage bucket",
          });
        }}
        onSetPrefixFilter={(prefix) => {
          setGcpSignedUrlResult(undefined);
          setGcpSignedUrlStatus("");
          void mutateWorkspaceSelection("gcp.storage.setPrefixFilter", { prefix }, {
            immediate: true,
            errorTitle: "Failed to open Cloud Storage folder",
          });
        }}
        onLoadMoreObjects={() => {
          const token = activeWorkspace.gcpStorageObjectsNextToken;
          if (!token) {
            return;
          }
          void mutateWorkspaceSelection(
            "gcp.storage.loadMoreObjects",
            { pageToken: token },
            {
              immediate: true,
              errorTitle: "Failed to load more Cloud Storage objects",
              merge: (current, incoming) => ({
                ...current,
                ...incoming,
                gcpStorageObjects: [
                  ...(current.gcpStorageObjects ?? []),
                  ...(incoming.gcpStorageObjects ?? []),
                ],
              }),
            },
          );
        }}
        onUploadObject={(sourcePath, objectKey) => {
          void backendRequest<{ workspace: WorkspaceSnapshot }>("gcp.storage.uploadObject", {
            sourcePath,
            objectKey,
          })
            .then((response) => {
              startTransition(() => {
                setWorkspace(normaliseWorkspaceSnapshot(response.workspace));
              });
            })
            .catch((error: unknown) => {
              notify("error", "Failed to upload Cloud Storage object", formatBackendError(error));
            });
        }}
        onDeleteObject={(objectKey) => {
          void mutateWorkspaceSelection(
            "gcp.storage.deleteObject",
            { objectKey },
            {
              immediate: true,
              errorTitle: "Failed to delete Cloud Storage object",
            },
          );
        }}
        onSignUrl={(objectKey, durationSeconds) => {
          setGcpSignedUrlStatus(`Generating signed link for ${objectKey}...`);
          setGcpSignedUrlResult(undefined);
          void backendRequest<{ result: GcpStorageSignUrlResult }>("gcp.storage.signUrl", {
            objectKey,
            durationSeconds,
          })
            .then((response) => {
              setGcpSignedUrlResult(response.result);
              setGcpSignedUrlStatus(
                `Signed link ready · expires ${response.result.expiresAt}.`,
              );
            })
            .catch((error: unknown) => {
              setGcpSignedUrlStatus(error instanceof Error ? error.message : String(error));
            });
        }}
      />
    );
  }

  if (session.isLocked && activeWorkspaceTabId === "gcp-compute") {
    return (
      <GcpComputeView
        workspace={activeWorkspace}
        onRefresh={() => {
          void refreshDiscovery();
        }}
        onStartInstance={(instanceName, zone) => {
          void mutateWorkspaceSelection(
            "gcp.compute.startInstance",
            { instanceName, zone },
            {
              immediate: true,
              errorTitle: "Failed to start Compute Engine instance",
            },
          );
        }}
        onStopInstance={(instanceName, zone) => {
          void mutateWorkspaceSelection(
            "gcp.compute.stopInstance",
            { instanceName, zone },
            {
              immediate: true,
              errorTitle: "Failed to stop Compute Engine instance",
            },
          );
        }}
      />
    );
  }

  if (session.isLocked && activeWorkspaceTabId === "gcp-functions") {
    return (
      <GcpFunctionsView
        workspace={activeWorkspace}
        onRefresh={() => {
          void refreshDiscovery();
        }}
        onSelectFunction={(functionKey, name, region) => {
          void mutateWorkspaceSelection(
            "gcp.functions.selectFunction",
            { functionKey, name, region },
            {
              immediate: true,
              errorTitle: "Failed to select Cloud Function",
            },
          );
        }}
        onInvoke={async (name, region, generation, data) => {
          try {
            const response = await backendRequest<{ result: GcpCloudFunctionInvokeResult }>(
              "gcp.functions.call",
              { name, region, generation, data },
            );
            notify("success", `Invoked ${name}`);
            return response.result;
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            notify("error", "Cloud Function invoke", message);
            throw error instanceof Error ? error : new Error(message);
          }
        }}
      />
    );
  }

  if (session.isLocked && activeWorkspaceTabId === "gcp-gke") {
    return (
      <GcpGkeView
        workspace={activeWorkspace}
        onRefresh={() => {
          void refreshDiscovery();
        }}
        onSelectCluster={(clusterName) => {
          void mutateWorkspaceSelection(
            "gcp.gke.selectCluster",
            { clusterName },
            {
              immediate: true,
              errorTitle: "Failed to select GKE cluster",
            },
          );
        }}
      />
    );
  }

  return activeWorkspaceTabId === "virtualisation" ? (
    <RuntimeView
      workspace={activeWorkspace}
      unlocked={!session.isLocked}
      showSensitiveValues={showSensitiveValues}
      onRefreshDockerRuntime={() => {
        void refreshDockerRuntime();
      }}
      localStack={{
        authToken: localStack.authToken,
        onAuthTokenChange: localStack.setAuthToken,
        persistence: localStack.persistence,
        onPersistenceChange: localStack.setPersistence,
        environmentText: localStack.environmentText,
        onEnvironmentTextChange: localStack.setEnvironmentText,
        logs: localStack.logs,
        logsStatus: localStack.logsStatus,
        actionStatus: localStack.actionStatus,
        actionInFlight: localStack.actionInFlight,
        onRefreshLogs: () => {
          void localStack.refreshLogs();
        },
        onInvokeAction: (action) => {
          void localStack.invokeAction(action);
        },
      }}
      flociAz={{
        persistence: flociAz.persistence,
        onPersistenceChange: flociAz.setPersistence,
        environmentText: flociAz.environmentText,
        onEnvironmentTextChange: flociAz.setEnvironmentText,
        logs: flociAz.logs,
        logsStatus: flociAz.logsStatus,
        actionStatus: flociAz.actionStatus,
        actionInFlight: flociAz.actionInFlight,
        onRefreshLogs: () => {
          void flociAz.refreshLogs();
        },
        onInvokeAction: (action) => {
          void flociAz.invokeAction(action);
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
  ) : showOnboarding ? (
    <OnboardingWizard
      providers={providers}
      profiles={profiles}
      discoveryLoading={loading}
      preferencesSnapshot={props.preferencesSnapshot}
      preferencesSaving={props.preferencesSaving}
      dockerReady={workspace.dockerRuntime.reachable}
      emulators={workspace.emulatorSummaries}
      onLoadPreferences={props.onLoadPreferences}
      onPreferencesUpdate={props.onPreferencesUpdate}
      onRefreshDiscovery={refreshDiscovery}
      onRefreshDocker={refreshDockerRuntime}
      onOpenRuntime={() => setActiveWorkspaceTabId("virtualisation")}
      onStartEmulator={(emulatorId) =>
        emulatorId === "localstack"
          ? localStack.invokeAction("start")
          : flociAz.invokeAction("start")
      }
      onComplete={() => {
        markOnboardingComplete();
        setShowOnboarding(false);
      }}
      onRunFirstLab={() => {
        markOnboardingComplete();
        setShowOnboarding(false);
        setDeployRecipeId(FIRST_LAB_RECIPE_ID);
        setActiveWorkspaceTabId("deploy");
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
}
