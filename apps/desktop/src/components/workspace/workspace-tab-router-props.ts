// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { Dispatch, SetStateAction } from "react";

import type {
  ActivityLogEntry,
  AwsLambdaCreateInput,
  AwsLambdaInvokeResult,
  AwsS3PresignResult,
  AwsSqsPeekResult,
  AzureLogAnalyticsHistoryEntry,
  AzureLogAnalyticsSavedQuery,
  EmulatorLogSnapshot,
  JobLifecycle,
  HiddenResourceHit,
  PreferencesSnapshot,
  ProfileSummary,
  ProviderSummary,
  ServicePreferences,
  SessionSnapshot,
  UrlInspection,
  UrlValidationResult,
  WorkspaceSnapshot,
} from "@/types/backend";

type EC2LifecycleAction = "start" | "stop" | "reboot";

type MutateWorkspaceSelectionOptions = {
  merge?: (current: WorkspaceSnapshot, incoming: WorkspaceSnapshot) => WorkspaceSnapshot;
  onOptimistic?: () => void;
  persistOnly?: boolean;
  panelLoading?: boolean;
  errorTitle?: string;
};

export type WorkspaceTabRouterProps = {
  activeWorkspaceTabId: string;
  setActiveWorkspaceTabId: Dispatch<SetStateAction<string>>;
  session: SessionSnapshot;
  activeWorkspace: WorkspaceSnapshot;
  workspace: WorkspaceSnapshot;
  selectedProvider?: ProviderSummary;
  selectedProfile?: ProfileSummary;
  profiles: ProfileSummary[];
  providers: ProviderSummary[];
  loading: boolean;
  openingProfileId?: string;
  logs: ActivityLogEntry[];
  showSensitiveValues: boolean;
  setShowSensitiveValues: Dispatch<SetStateAction<boolean>>;
  activeS3PageId: string;
  setActiveS3PageId: Dispatch<SetStateAction<string>>;
  activeAzurePageId: string;
  activeAzureStoragePageId: string;
  s3UploadStatus: string;
  setS3UploadStatus: Dispatch<SetStateAction<string>>;
  s3SignedUrlStatus: string;
  setS3SignedUrlStatus: Dispatch<SetStateAction<string>>;
  s3SignedUrlResult?: AwsS3PresignResult;
  s3UrlInspection?: UrlInspection;
  setS3UrlInspection: Dispatch<SetStateAction<UrlInspection | undefined>>;
  s3UrlValidation?: UrlValidationResult;
  ec2ActionStatus: string;
  ec2ActionInFlight: boolean;
  ec2ActionHistory: Array<{
    jobId: string;
    status: JobLifecycle;
    message: string;
    completedAt?: string;
  }>;
  lambdaActionStatus: string;
  lambdaInvokeResult: AwsLambdaInvokeResult | null;
  lambdaInvokeInFlight: boolean;
  lambdaCreateInFlight: boolean;
  lambdaCreateFormOpen: boolean;
  setLambdaCreateFormOpen: Dispatch<SetStateAction<boolean>>;
  dynamodbActionStatus: string;
  sqsActionStatus: string;
  sqsPeekResult: AwsSqsPeekResult | null;
  sqsPeekInFlight: boolean;
  snsActionStatus: string;
  rdsActionStatus: string;
  ecsActionStatus: string;
  eksActionStatus: string;
  apiGatewayActionStatus: string;
  secretsManagerActionStatus: string;
  logsActionStatus: string;
  iamActionStatus: string;
  azureActionStatus: string;
  setAzureActionStatus: Dispatch<SetStateAction<string>>;
  azureStorageActionStatus: string;
  setAzureStorageActionStatus: Dispatch<SetStateAction<string>>;
  azureAppServiceActionStatus: string;
  setAzureAppServiceActionStatus: Dispatch<SetStateAction<string>>;
  azureFrontDoorActionStatus: string;
  setAzureFrontDoorActionStatus: Dispatch<SetStateAction<string>>;
  azureServiceInventoryLoading: boolean;
  azureLogWorkspaceSelectionLoading: boolean;
  azureWafConfigLoading: boolean;
  azureFrontDoorTopologyLoading: boolean;
  logAnalyticsPrefill: { query?: string; timespan?: string } | null;
  setLogAnalyticsPrefill: Dispatch<
    SetStateAction<{ query?: string; timespan?: string } | null>
  >;
  frontDoorAccessPrefill: {
    trackingReference: string;
    workspace?: string;
    timespan?: string;
  } | null;
  setFrontDoorAccessPrefill: Dispatch<
    SetStateAction<{
      trackingReference: string;
      workspace?: string;
      timespan?: string;
    } | null>
  >;
  localStackAuthToken: string;
  setLocalStackAuthToken: Dispatch<SetStateAction<string>>;
  localStackPersistence: boolean;
  setLocalStackPersistence: Dispatch<SetStateAction<boolean>>;
  localStackEnvironmentText: string;
  setLocalStackEnvironmentText: Dispatch<SetStateAction<string>>;
  localStackLogs: EmulatorLogSnapshot;
  localStackLogsStatus: string;
  localStackActionStatus: string;
  localStackActionInFlight: boolean;
  flociAzPersistence: boolean;
  setFlociAzPersistence: Dispatch<SetStateAction<boolean>>;
  flociAzEnvironmentText: string;
  setFlociAzEnvironmentText: Dispatch<SetStateAction<string>>;
  flociAzLogs: EmulatorLogSnapshot;
  flociAzLogsStatus: string;
  flociAzActionStatus: string;
  flociAzActionInFlight: boolean;
  setWorkspace: Dispatch<SetStateAction<WorkspaceSnapshot>>;
  setSession: Dispatch<SetStateAction<SessionSnapshot>>;
  mutateWorkspaceSelection: (
    method: string,
    params: Record<string, unknown>,
    options?: MutateWorkspaceSelectionOptions,
  ) => Promise<void>;
  mutateSession: (method: string, params?: Record<string, unknown>) => Promise<void>;
  refreshDiscovery: () => Promise<void>;
  refreshDockerRuntime: () => Promise<void>;
  refreshLocalStackLogs: () => Promise<void>;
  refreshFlociAzLogs: () => Promise<void>;
  refreshEC2Inventory: () => void;
  selectEC2Region: (region: string) => void;
  selectEC2Instance: (instanceId: string) => void;
  invokeEC2LifecycleAction: (action: EC2LifecycleAction, instanceId: string) => void;
  refreshLambdaInventory: () => void;
  selectLambdaRegion: (region: string) => void;
  selectLambdaFunction: (functionName: string) => void;
  invokeLambda: (functionName: string, payload: unknown) => void;
  createLambda: (input: AwsLambdaCreateInput) => void;
  refreshDynamoDBInventory: () => void;
  selectDynamoDBRegion: (region: string) => void;
  selectDynamoDBTable: (tableName: string) => void;
  putDynamoDBItem: (tableName: string, itemJson: string) => void;
  deleteDynamoDBItem: (tableName: string, keyJson: string) => void;
  refreshSQSInventory: () => void;
  selectSQSRegion: (region: string) => void;
  selectSQSQueue: (queueUrl: string) => void;
  peekSQSQueue: (queueUrl: string) => void;
  sendSQSMessage: (queueUrl: string, messageBody: string) => void;
  createSQSQueue: (queueName: string) => void;
  refreshSNSInventory: () => void;
  selectSNSRegion: (region: string) => void;
  selectSNSTopic: (topicArn: string) => void;
  publishSNSTopic: (topicArn: string, message: string) => void;
  createSNSTopic: (topicName: string) => void;
  refreshRDSInventory: () => void;
  selectRDSRegion: (region: string) => void;
  selectRDSInstance: (instanceId: string) => void;
  deleteS3Object: (objectKey: string) => void;
  createS3Bucket: (bucketName: string, region?: string) => void;
  runEC2Instances: (instanceType?: string) => void;
  terminateEC2Instance: (instanceId: string) => void;
  deleteLambdaFunction: (functionName: string) => void;
  invokeRDSLifecycleAction: (action: "start" | "stop", instanceId: string) => void;
  createLogGroup: (logGroupName: string) => void;
  putLogEvents: (logGroupName: string, message: string) => void;
  createIAMRole: (roleName: string) => void;
  refreshECSInventory: () => void;
  selectECSRegion: (region: string) => void;
  selectECSCluster: (clusterArn: string) => void;
  selectECSService: (serviceArn: string) => void;
  selectECSTask: (taskArn: string) => void;
  refreshEKSInventory: () => void;
  selectEKSRegion: (region: string) => void;
  selectEKSCluster: (clusterName: string) => void;
  refreshApiGatewayInventory: () => void;
  selectApiGatewayRegion: (region: string) => void;
  selectApiGatewayApi: (apiKey: string) => void;
  refreshSecretsManagerInventory: () => void;
  selectSecretsManagerRegion: (region: string) => void;
  selectSecretsManagerSecret: (secretName: string) => void;
  refreshLogsInventory: () => void;
  selectLogsRegion: (region: string) => void;
  selectLogGroup: (logGroupName: string) => void;
  refreshIAMInventory: () => void;
  selectIAMRole: (roleName: string) => void;
  applyS3PrefixFilter: (prefix: string) => void;
  selectAzureResourceGroup: (resourceGroup: string) => Promise<void>;
  selectAzureVirtualMachine: (vmId: string) => Promise<void>;
  selectAzureWebApp: (appName: string) => Promise<void>;
  selectAzureWebAppSlot: (slot: string) => Promise<void>;
  selectAzureLogAnalyticsWorkspace: (workspaceName: string) => Promise<void>;
  selectAzureWafPolicy: (policyName: string) => Promise<void>;
  refreshAzureFrontDoorTopology: (
    workspace: WorkspaceSnapshot,
    profileId: string,
    options?: { force?: boolean },
  ) => Promise<void>;
  listLogAnalyticsHistory: (workspace: string) => Promise<AzureLogAnalyticsHistoryEntry[]>;
  listLogAnalyticsSaved: (workspace: string) => Promise<AzureLogAnalyticsSavedQuery[]>;
  invokeLocalStackAction: (
    action: "prepareProfile" | "start" | "stop" | "recreate",
  ) => Promise<void>;
  invokeFlociAzAction: (
    action: "prepareProfile" | "start" | "stop" | "recreate",
  ) => Promise<void>;
  openWorkspace: (providerId: string, profileId: string) => Promise<void>;
  chooseAuthMethod: (authMethod: string) => Promise<void>;
  preferencesSnapshot: PreferencesSnapshot | null;
  preferencesSaving: boolean;
  onPreferencesUpdate: (preferences: ServicePreferences) => Promise<void>;
  hiddenResourceHits: HiddenResourceHit[];
  hiddenResourceEnablingServiceId: string | null;
  onEnableHiddenService: (hit: HiddenResourceHit) => Promise<void>;
};

export type AwsWorkspaceTabsProps = WorkspaceTabRouterProps;
export type AzureWorkspaceTabsProps = WorkspaceTabRouterProps;