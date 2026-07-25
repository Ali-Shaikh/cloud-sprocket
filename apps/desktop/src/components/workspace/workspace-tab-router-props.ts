// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { Dispatch, SetStateAction } from "react";

import type { NavigateToResourceParams } from "@/lib/navigate-to-resource";
import type {
  ActivityLogEntry,
  AwsLambdaInvokeResult,
  AwsS3PresignResult,
  AwsSqsPeekResult,
  AzureLogAnalyticsHistoryEntry,
  AzureLogAnalyticsSavedQuery,
  EmulatorLogSnapshot,
  JobLifecycle,
  HiddenResourceHit,
  PreferencesSnapshot,
  ServicePreferences,
  UrlInspection,
  UrlValidationResult,
  WorkspaceSnapshot,
} from "@/types/backend";

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
  loading: boolean;
  openingProfileId?: string;
  logs: ActivityLogEntry[];
  showSensitiveValues: boolean;
  setShowSensitiveValues: Dispatch<SetStateAction<boolean>>;
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
};

export type AwsWorkspaceTabsProps = WorkspaceTabRouterProps & {
  /** Deep-link navigator for inventory inspector cross-links. */
  navigateToResource?: (params: NavigateToResourceParams) => void;
};
export type AzureWorkspaceTabsProps = WorkspaceTabRouterProps;
