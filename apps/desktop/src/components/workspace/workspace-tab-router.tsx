// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useState, type ReactNode } from "react";
import { overviewNavigateToParams, resolveOverviewProvider } from "@/lib/navigate-to-resource";
import { toActivityEntries } from "@/lib/workspace-shell";
import { useNavigateToResource } from "@/hooks/use-navigate-to-resource";
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
import { ActivityView, RuntimeView, PlaceholderView, DeveloperToolsView } from "@/views/workspace/lazy-views";
import SettingsView from "@/views/SettingsView";
import { AwsWorkspaceTabs, AWS_TAB_IDS } from "./aws-workspace-tabs";
import { AzureWorkspaceTabs } from "./azure-workspace-tabs";
import type { WorkspaceTabRouterProps } from "./workspace-tab-router-props";

export function WorkspaceTabRouter(props: WorkspaceTabRouterProps): ReactNode {
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingComplete());
  const [deployRecipeId, setDeployRecipeId] = useState<string>();
  const {
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
    setActiveAzurePageId,
    activeAzureStoragePageId,
    setActiveAzureStoragePageId,
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
    deleteS3Object,
    createS3Bucket,
    copyS3Object,
    createS3FolderPrefix,
    runEC2Instances,
    terminateEC2Instance,
    deleteLambdaFunction,
    invokeRDSLifecycleAction,
    createLogGroup,
    putLogEvents,
    createIAMRole,
    refreshECSInventory,
    selectECSRegion,
    selectECSCluster,
    selectECSService,
    selectECSTask,
    refreshEKSInventory,
    selectEKSRegion,
    selectEKSCluster,
    refreshCloudFormationInventory,
    selectCloudFormationRegion,
    selectCloudFormationStack,
    refreshEventBridgeInventory,
    selectEventBridgeRegion,
    selectEventBridgeBus,
    refreshRoute53Inventory,
    selectRoute53HostedZone,
    refreshElbInventory,
    selectElbRegion,
    selectElbLoadBalancer,
    refreshKmsInventory,
    selectKmsRegion,
    selectKmsKey,
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
  } = props;

  const navigateToResource = useNavigateToResource({
    setActiveWorkspaceTabId,
    setActiveS3PageId,
    setActiveAzurePageId,
    setActiveAzureStoragePageId,
    setLambdaCreateFormOpen,
    mutateWorkspaceSelection,
    setWorkspace,
    selectLambdaFunction,
    selectDynamoDBTable,
    selectSQSQueue,
    selectSNSTopic,
    selectRDSInstance,
    selectLogGroup,
    selectIAMRole,
    selectEC2Instance,
    selectAzureResourceGroup,
    selectAzureVirtualMachine,
  });

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
            void invokeLocalStackAction("start");
            return;
          }
          void invokeFlociAzAction("start");
        }}
        runtimeActionInFlight={{
          localstack: localStackActionInFlight,
          "floci-az": flociAzActionInFlight,
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
    return <AwsWorkspaceTabs {...props} />;
  }

  if (session.isLocked && ["azure-overview","azure-resource-groups","azure-vms","azure-storage","azure-app-service","azure-tools","azure-log-analytics","azure-waf","azure-front-door","azure-functions","azure-key-vault","azure-cosmos","azure-postgres","azure-queues","azure-entra"].includes(activeWorkspaceTabId)) {
    return <AzureWorkspaceTabs {...props} />;
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
          ? invokeLocalStackAction("start")
          : invokeFlociAzAction("start")
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
