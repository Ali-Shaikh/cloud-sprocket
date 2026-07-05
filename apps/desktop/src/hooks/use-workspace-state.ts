// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useCallback, useMemo, useRef, useState } from "react";

import { backendRequest } from "@/lib/backend";
import {
  applySessionWriteModeToWorkspace,
  emptyWorkspace,
  normaliseWorkspaceSnapshot,
} from "@/lib/workspace-snapshot";
import type {
  AwsLambdaInvokeResult,
  AwsS3PresignResult,
  AwsSqsPeekResult,
  AzureLogAnalyticsHistoryEntry,
  AzureLogAnalyticsSavedQuery,
  EmulatorLogSnapshot,
  JobLifecycle,
  SessionSnapshot,
  UrlInspection,
  UrlValidationResult,
  WorkspaceSnapshot,
} from "@/types/backend";

type EC2ActionHistoryItem = {
  jobId: string;
  status: JobLifecycle;
  message: string;
  completedAt?: string;
};

const initialLocalStackLogs: EmulatorLogSnapshot = {
  emulatorId: "localstack",
  lines: [],
  summary: "LocalStack logs have not been loaded yet.",
};

const initialFlociAzLogs: EmulatorLogSnapshot = {
  emulatorId: "floci-az",
  lines: [],
  summary: "floci-az logs have not been loaded yet.",
};

export function useWorkspaceState(session: SessionSnapshot) {
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot>(emptyWorkspace);
  const [azureLogWorkspaceSelectionLoading, setAzureLogWorkspaceSelectionLoading] = useState(false);
  const azureLogWorkspaceSelectionRequest = useRef(0);
  const [s3UploadStatus, setS3UploadStatus] = useState(
    "Select a bucket and provide a local file path to upload.",
  );
  const [s3SignedUrlStatus, setS3SignedUrlStatus] = useState(
    "Select an object to generate a signed URL.",
  );
  const [s3SignedUrlResult, setS3SignedUrlResult] = useState<AwsS3PresignResult>();
  const [s3UrlInspection, setS3UrlInspection] = useState<UrlInspection>();
  const [s3UrlValidation, setS3UrlValidation] = useState<UrlValidationResult>();
  const [ec2ActionStatus, setEC2ActionStatus] = useState(
    "Select an EC2 region before refreshing inventory.",
  );
  const [ec2ActionInFlight, setEC2ActionInFlight] = useState(false);
  const [ec2ActionHistory, setEC2ActionHistory] = useState<EC2ActionHistoryItem[]>([]);
  const [lambdaActionStatus, setLambdaActionStatus] = useState(
    "Select a region before refreshing Lambda functions.",
  );
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
  const [ecsActionStatus, setEcsActionStatus] = useState(
    "Select a region before refreshing ECS clusters.",
  );
  const [eksActionStatus, setEksActionStatus] = useState(
    "Select a region before refreshing EKS clusters.",
  );
  const [apiGatewayActionStatus, setApiGatewayActionStatus] = useState(
    "Select a region before refreshing API Gateway APIs.",
  );
  const [secretsManagerActionStatus, setSecretsManagerActionStatus] = useState(
    "Select a region before refreshing Secrets Manager secrets.",
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
  const s3PrefixRequestIdRef = useRef(0);
  const [localStackAuthToken, setLocalStackAuthToken] = useState("");
  const [localStackPersistence, setLocalStackPersistence] = useState(false);
  const [localStackEnvironmentText, setLocalStackEnvironmentText] = useState("");
  const [localStackLogs, setLocalStackLogs] = useState<EmulatorLogSnapshot>(initialLocalStackLogs);
  const [localStackLogsStatus, setLocalStackLogsStatus] = useState("");
  const [localStackActionStatus, setLocalStackActionStatus] = useState(
    "No LocalStack action has run yet.",
  );
  const [localStackActionInFlight, setLocalStackActionInFlight] = useState(false);
  const [flociAzPersistence, setFlociAzPersistence] = useState(false);
  const [flociAzEnvironmentText, setFlociAzEnvironmentText] = useState(
    "FLOCI_AZ_SERVICES_FUNCTIONS_ENABLED=false",
  );
  const [flociAzLogs, setFlociAzLogs] = useState<EmulatorLogSnapshot>(initialFlociAzLogs);
  const [flociAzLogsStatus, setFlociAzLogsStatus] = useState("");
  const [flociAzActionStatus, setFlociAzActionStatus] = useState("No floci-az action has run yet.");
  const [flociAzActionInFlight, setFlociAzActionInFlight] = useState(false);
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
  const [showSensitiveValues, setShowSensitiveValues] = useState(false);

  const activeWorkspace = useMemo(
    () => applySessionWriteModeToWorkspace(workspace, session),
    [workspace, session],
  );

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

  const resetWorkspaceUiState = useCallback(() => {
    setWorkspace(emptyWorkspace);
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
    setLocalStackLogs(initialLocalStackLogs);
    setLocalStackLogsStatus("");
    setLocalStackActionStatus("No LocalStack action has run yet.");
    setLocalStackActionInFlight(false);
    setFlociAzPersistence(false);
    setFlociAzEnvironmentText("FLOCI_AZ_SERVICES_FUNCTIONS_ENABLED=false");
    setFlociAzLogs(initialFlociAzLogs);
    setFlociAzLogsStatus("");
    setFlociAzActionStatus("No floci-az action has run yet.");
    setFlociAzActionInFlight(false);
    setActiveS3PageId("buckets");
    setActiveAzurePageId("resource-groups");
    setShowSensitiveValues(false);
  }, []);

  const applyVirtualisationSnapshot = useCallback(
    (runtimeResult: {
      dockerRuntime: WorkspaceSnapshot["dockerRuntime"];
      dockerResources: WorkspaceSnapshot["dockerResources"];
      emulatorSummaries: WorkspaceSnapshot["emulatorSummaries"];
      dockerDiagnostics: WorkspaceSnapshot["dockerDiagnostics"];
    }) => {
      setWorkspace((current) =>
        normaliseWorkspaceSnapshot({
          ...current,
          dockerRuntime: runtimeResult.dockerRuntime,
          dockerResources: runtimeResult.dockerResources,
          emulatorSummaries: runtimeResult.emulatorSummaries,
          dockerDiagnostics: runtimeResult.dockerDiagnostics,
        }),
      );
    },
    [],
  );

  return {
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
    setS3UrlValidation,
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
    setFlociAzActionStatus,
    flociAzActionInFlight,
    setFlociAzActionInFlight,
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
    applyVirtualisationSnapshot,
  };
}