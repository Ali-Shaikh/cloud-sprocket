// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { NavigationLocation } from "@/lib/navigation-location";
import type { NavigateToResourceParams } from "@/lib/navigate-to-resource";
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
  /** When true, apply optimistic/result updates synchronously (avoids list flicker). */
  immediate?: boolean;
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
  setActiveAzurePageId: Dispatch<SetStateAction<string>>;
  activeAzureStoragePageId: string;
  setActiveAzureStoragePageId: Dispatch<SetStateAction<string>>;
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
  cloudFormationActionStatus: string;
  eventBridgeActionStatus: string;
  route53ActionStatus: string;
  elbActionStatus: string;
  kmsActionStatus: string;
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
  mutateSession: (method: string, params?: Record<string, unknown>) => Promise<boolean>;
  refreshDiscovery: () => Promise<void>;
  refreshDockerRuntime: () => Promise<void>;
  refreshLocalStackLogs: () => Promise<void>;
  refreshFlociAzLogs: () => Promise<void>;
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
  onLoadPreferences: () => Promise<PreferencesSnapshot>;
  onPreferencesUpdate: (preferences: ServicePreferences) => Promise<void>;
  hiddenResourceHits: HiddenResourceHit[];
  hiddenResourceEnablingServiceId: string | null;
  onEnableHiddenService: (hit: HiddenResourceHit) => Promise<void>;
  /** History/recents recorder for resource deep links. */
  recordLocation?: (location: NavigationLocation) => void;
  /** Shell holds a ref so the palette can jump to resources. */
  navigateToResourceRef?: MutableRefObject<
    ((params: NavigateToResourceParams, options?: { record?: boolean }) => void) | null
  >;
};

export type AwsWorkspaceTabsProps = WorkspaceTabRouterProps & {
  /** Deep-link navigator for inventory inspector cross-links. */
  navigateToResource?: (params: NavigateToResourceParams) => void;
};
export type AzureWorkspaceTabsProps = WorkspaceTabRouterProps;
