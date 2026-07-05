// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { ReactNode } from "react";
import { mergeAwsS3Selection, normaliseWorkspaceSnapshot } from "@/lib/workspace-snapshot";
import { toActivityEntries } from "@/lib/workspace-shell";
import ConnectView from "@/views/ConnectView";
import OverviewView from "@/views/OverviewView";
import DeployView from "@/views/DeployView";
import DebugView from "@/views/DebugView";
import { ActivityView, RuntimeView, PlaceholderView, DeveloperToolsView } from "@/views/workspace/lazy-views";
import SettingsView from "@/views/SettingsView";
import { AwsWorkspaceTabs, AWS_TAB_IDS } from "./aws-workspace-tabs";
import { AzureWorkspaceTabs } from "./azure-workspace-tabs";
import type { WorkspaceTabRouterProps } from "./workspace-tab-router-props";

export function WorkspaceTabRouter(props: WorkspaceTabRouterProps): ReactNode {
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
  } = props;

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
    return <DeployView profiles={profiles} />;
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
