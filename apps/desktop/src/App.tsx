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
  Boxes,
  Bug,
  LayoutGrid,
  Rocket,
  Server,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Toaster } from "sonner";
import awsEc2IconUrl from "./assets/cloud-icons/aws-ec2.svg";
import awsDynamodbIconUrl from "./assets/cloud-icons/aws-dynamodb.svg";
import awsLambdaIconUrl from "./assets/cloud-icons/aws-lambda.svg";
import awsS3IconUrl from "./assets/cloud-icons/aws-s3.svg";
import awsSqsIconUrl from "./assets/cloud-icons/aws-sqs.svg";
import awsSnsIconUrl from "./assets/cloud-icons/aws-sns.svg";
import awsRdsIconUrl from "./assets/cloud-icons/aws-rds.svg";
import awsCloudwatchIconUrl from "./assets/cloud-icons/aws-cloudwatch.svg";
import awsIamIconUrl from "./assets/cloud-icons/aws-iam.svg";
import azureIconUrl from "./assets/cloud-icons/azure.svg";
import azureResourceGroupsIconUrl from "./assets/cloud-icons/azure-resource-groups.svg";
import azureVmIconUrl from "./assets/cloud-icons/azure-vm.svg";
import azureStorageIconUrl from "./assets/cloud-icons/azure-storage.svg";
import azureAppServiceIconUrl from "./assets/cloud-icons/azure-app-service.svg";
import azureLogAnalyticsIconUrl from "./assets/cloud-icons/azure-log-analytics.svg";
import azureWafIconUrl from "./assets/cloud-icons/azure-waf.svg";
import azureFunctionsIconUrl from "./assets/cloud-icons/azure-functions.svg";
import azureKeyVaultIconUrl from "./assets/cloud-icons/azure-key-vault.svg";
import azureCosmosIconUrl from "./assets/cloud-icons/azure-cosmos.svg";
import azureQueuesIconUrl from "./assets/cloud-icons/azure-queues.svg";
import azureEntraIconUrl from "./assets/cloud-icons/azure-entra.svg";
import { backendRequest, subscribeToBackendEvent, addDebugLog, clearDebugLogs } from "./lib/backend";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isS3UploadResult(value: unknown): value is AwsS3UploadResult {
  return isRecord(value) && typeof value.destinationUri === "string";
}

function isS3PresignResult(value: unknown): value is AwsS3PresignResult {
  return isRecord(value) && typeof value.url === "string" && typeof value.objectKey === "string";
}

function isUrlValidationResult(value: unknown): value is UrlValidationResult {
  return isRecord(value) && typeof value.url === "string" && typeof value.summary === "string";
}

function isWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
  return isRecord(value) && Array.isArray(value.ec2Instances) && typeof value.runtimeSettings === "object";
}

function normaliseArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function normaliseProvider(provider: ProviderSummary): ProviderSummary {
  return {
    ...provider,
    locations: normaliseArray(provider.locations),
  };
}

function normaliseProfile(profile: ProfileSummary): ProfileSummary {
  return {
    ...profile,
    sourcePaths: normaliseArray(profile.sourcePaths),
    attributes: normaliseArray(profile.attributes),
    authMethods: normaliseArray(profile.authMethods),
  };
}

function normaliseDetailFields(fields: DetailField[] | null | undefined): DetailField[] {
  return normaliseArray(fields);
}

function normaliseDockerResource(resource: ManagedDockerResource): ManagedDockerResource {
  return {
    ...resource,
    details: normaliseDetailFields(resource.details),
  };
}

function normaliseEmulatorSummary(emulator: EmulatorSummary): EmulatorSummary {
  return {
    ...emulator,
    details: normaliseDetailFields(emulator.details),
  };
}

function defaultLocalStackSummary(): EmulatorSummary {
  return {
    emulatorId: "localstack",
    providerId: "aws",
    label: "LocalStack",
    kind: "docker",
    status: "not-configured",
    summary: "LocalStack status is not available yet. Start will ask Docker to create the managed container.",
    details: [
      { label: "Image", value: "localstack/localstack:stable" },
      { label: "Endpoint", value: "http://localhost:4566" },
    ],
  };
}

function defaultFlociAzSummary(): EmulatorSummary {
  return {
    emulatorId: "floci-az",
    providerId: "azure",
    label: "floci-az",
    kind: "docker",
    status: "not-configured",
    summary: "floci-az status is not available yet. Start will ask Docker to create the managed container.",
    details: [
      { label: "Image", value: "floci/floci-az:latest" },
      { label: "Endpoint", value: "http://localhost:4577" },
    ],
  };
}

function ensureEmulatorSummaries(emulators: EmulatorSummary[]): EmulatorSummary[] {
  const byId = new Map(emulators.map((emulator) => [emulator.emulatorId, emulator]));
  return [
    byId.get("localstack") ?? defaultLocalStackSummary(),
    byId.get("floci-az") ?? defaultFlociAzSummary(),
    ...emulators.filter((emulator) => emulator.emulatorId !== "localstack" && emulator.emulatorId !== "floci-az"),
  ];
}

function normaliseLocalConfigArtifact(artifact: LocalConfigArtifact): LocalConfigArtifact {
  return { ...artifact };
}

function normaliseAzureResourceGroup(resourceGroup: AzureResourceGroup): AzureResourceGroup {
  return {
    ...resourceGroup,
    tags: normaliseDetailFields(resourceGroup.tags),
  };
}

function normaliseAzureStorageAccount(account: AzureStorageAccount): AzureStorageAccount {
  return { ...account };
}

function normaliseAzureBlobContainer(container: AzureBlobContainer): AzureBlobContainer {
  return { ...container };
}

function normaliseAzureBlob(blob: AzureBlob): AzureBlob {
  return { ...blob };
}

function normaliseAzureWebApp(app: AzureWebApp): AzureWebApp {
  return { ...app, name: app.name ?? "" };
}

function normaliseAzureAppServicePlan(plan: AzureAppServicePlan): AzureAppServicePlan {
  return { ...plan, name: plan.name ?? "" };
}

function normaliseAzureWebAppSetting(setting: AzureWebAppSetting): AzureWebAppSetting {
  return { ...setting, name: setting.name ?? "", value: setting.value ?? "" };
}

function normaliseAzureVirtualMachine(vm: AzureVirtualMachine): AzureVirtualMachine {
  return {
    ...vm,
    tags: normaliseDetailFields(vm.tags),
  };
}

function normaliseS3Bucket(bucket: AwsS3Bucket): AwsS3Bucket {
  return { ...bucket };
}

function normaliseS3Object(object: AwsS3Object): AwsS3Object {
  return { ...object };
}

function normaliseS3ExportSnippet(snippet: AwsS3ExportSnippet): AwsS3ExportSnippet {
  return { ...snippet };
}

function normaliseEC2Instance(instance: AwsEc2Instance): AwsEc2Instance {
  return {
    ...instance,
    securityGroups: normaliseArray(instance.securityGroups),
    tags: normaliseDetailFields(instance.tags),
  };
}

function normaliseLambdaFunction(fn: AwsLambdaFunction): AwsLambdaFunction {
  return {
    ...fn,
    recentLogs: normaliseArray(fn.recentLogs),
  };
}

function normaliseDynamoDBTable(table: AwsDynamoDBTable): AwsDynamoDBTable {
  return {
    ...table,
    globalSecondaryIndexes: normaliseArray(table.globalSecondaryIndexes),
    sampleItems: normaliseArray(table.sampleItems),
  };
}

function normaliseSqsQueue(queue: AwsSqsQueue): AwsSqsQueue {
  return { ...queue };
}

function normaliseSnsTopic(topic: AwsSnsTopic): AwsSnsTopic {
  return {
    ...topic,
    subscriptions: normaliseArray(topic.subscriptions),
  };
}

function normaliseRdsInstance(instance: AwsRdsInstance): AwsRdsInstance {
  return { ...instance };
}

function normaliseLogGroup(group: AwsLogGroup): AwsLogGroup {
  return {
    ...group,
    recentEvents: normaliseArray(group.recentEvents),
  };
}

function normaliseIamRole(role: AwsIamRole): AwsIamRole {
  return {
    ...role,
    attachedPolicies: normaliseArray(role.attachedPolicies),
  };
}

function normaliseIamPolicy(policy: AwsIamPolicy): AwsIamPolicy {
  return { ...policy };
}

function normaliseSessionSnapshot(session: Partial<SessionSnapshot> | null | undefined): SessionSnapshot {
  return {
    ...emptySession,
    ...(session ?? {}),
    isLocked: session?.isLocked ?? false,
    currentProviderId: session?.currentProviderId,
    selectedProfileId: session?.selectedProfileId,
    selectedAuthMethod: session?.selectedAuthMethod,
    availableAuthMethods: normaliseArray(session?.availableAuthMethods),
    lockedProviderId: session?.lockedProviderId,
    lockedProfileId: session?.lockedProfileId,
    lockedAuthMethod: session?.lockedAuthMethod,
    workspaceTabs: normaliseArray(session?.workspaceTabs),
    selectedS3BucketName: session?.selectedS3BucketName,
    selectedS3ObjectKey: session?.selectedS3ObjectKey,
    s3PrefixFilter: session?.s3PrefixFilter ?? "",
    selectedEc2Region: session?.selectedEc2Region,
    selectedEc2InstanceId: session?.selectedEc2InstanceId,
    selectedAzureResourceGroup: session?.selectedAzureResourceGroup,
    selectedAzureVmId: session?.selectedAzureVmId,
    selectedAzureStorageAccount: session?.selectedAzureStorageAccount,
    selectedAzureBlobContainer: session?.selectedAzureBlobContainer,
    selectedAzureBlobName: session?.selectedAzureBlobName,
    azureBlobPrefixFilter: session?.azureBlobPrefixFilter ?? "",
    azureWriteModeEnabled: session?.azureWriteModeEnabled ?? false,
  };
}

function mergeAzureResourceGroupSelection(
  current: WorkspaceSnapshot,
  incoming: WorkspaceSnapshot,
): WorkspaceSnapshot {
  const normalised = normaliseWorkspaceSnapshot(incoming);
  return normaliseWorkspaceSnapshot({
    ...current,
    selectedAzureResourceGroup: normalised.selectedAzureResourceGroup,
    selectedAzureVmId: normalised.selectedAzureVmId,
    azureResourceGroups: normalised.azureResourceGroups,
    azureVirtualMachines: normalised.azureVirtualMachines,
    azureWebApps: normalised.azureWebApps,
    azureAppServicePlans: normalised.azureAppServicePlans,
    azureWebAppSettings: normalised.azureWebAppSettings,
    azureWebAppDeploymentSlots: normalised.azureWebAppDeploymentSlots,
    selectedAzureWebAppName: normalised.selectedAzureWebAppName,
    selectedAzureWebAppSlot: normalised.selectedAzureWebAppSlot,
    azureStatusMessage: normalised.azureStatusMessage,
    azureAppServiceStatusMessage: normalised.azureAppServiceStatusMessage,
  });
}

function mergeAzureStorageSelection(
  current: WorkspaceSnapshot,
  incoming: WorkspaceSnapshot,
): WorkspaceSnapshot {
  const normalised = normaliseWorkspaceSnapshot(incoming);
  return normaliseWorkspaceSnapshot({
    ...current,
    selectedAzureStorageAccount: normalised.selectedAzureStorageAccount,
    selectedAzureBlobContainer: normalised.selectedAzureBlobContainer,
    selectedAzureBlobName: normalised.selectedAzureBlobName,
    azureBlobPrefixFilter: normalised.azureBlobPrefixFilter,
    azureStorageAccounts: normalised.azureStorageAccounts,
    azureBlobContainers: normalised.azureBlobContainers,
    azureBlobs: normalised.azureBlobs,
    azureBlobMetadata: normalised.azureBlobMetadata,
    azureStorageStatusMessage: normalised.azureStorageStatusMessage,
  });
}

function mergeAzureFunctionsSelection(
  current: WorkspaceSnapshot,
  incoming: WorkspaceSnapshot,
): WorkspaceSnapshot {
  const normalised = normaliseWorkspaceSnapshot(incoming);
  return normaliseWorkspaceSnapshot({
    ...current,
    selectedAzureFunctionApp: normalised.selectedAzureFunctionApp,
    selectedAzureFunction: normalised.selectedAzureFunction,
    azureFunctionApps: normalised.azureFunctionApps,
    azureFunctions: normalised.azureFunctions,
    azureFunctionsStatusMessage: normalised.azureFunctionsStatusMessage,
  });
}

function mergeAzureKeyVaultSelection(
  current: WorkspaceSnapshot,
  incoming: WorkspaceSnapshot,
): WorkspaceSnapshot {
  const normalised = normaliseWorkspaceSnapshot(incoming);
  return normaliseWorkspaceSnapshot({
    ...current,
    selectedAzureKeyVault: normalised.selectedAzureKeyVault,
    selectedAzureSecret: normalised.selectedAzureSecret,
    azureKeyVaults: normalised.azureKeyVaults,
    azureKeyVaultSecrets: normalised.azureKeyVaultSecrets,
    azureKeyVaultStatusMessage: normalised.azureKeyVaultStatusMessage,
  });
}

function mergeAzureCosmosSelection(
  current: WorkspaceSnapshot,
  incoming: WorkspaceSnapshot,
): WorkspaceSnapshot {
  const normalised = normaliseWorkspaceSnapshot(incoming);
  return normaliseWorkspaceSnapshot({
    ...current,
    selectedAzureCosmosAccount: normalised.selectedAzureCosmosAccount,
    selectedAzureCosmosDatabase: normalised.selectedAzureCosmosDatabase,
    selectedAzureCosmosContainer: normalised.selectedAzureCosmosContainer,
    azureCosmosAccounts: normalised.azureCosmosAccounts,
    azureCosmosDatabases: normalised.azureCosmosDatabases,
    azureCosmosContainers: normalised.azureCosmosContainers,
    azureCosmosItems: normalised.azureCosmosItems,
    azureCosmosStatusMessage: normalised.azureCosmosStatusMessage,
  });
}

function mergeAzureFrontDoorSelection(
  current: WorkspaceSnapshot,
  incoming: WorkspaceSnapshot,
): WorkspaceSnapshot {
  const normalised = normaliseWorkspaceSnapshot(incoming);
  return normaliseWorkspaceSnapshot({
    ...current,
    selectedAzureFrontDoorProfile: normalised.selectedAzureFrontDoorProfile,
    selectedAzureFrontDoorEndpoint: normalised.selectedAzureFrontDoorEndpoint,
    selectedAzureFrontDoorOriginGroup: normalised.selectedAzureFrontDoorOriginGroup,
    azureFrontDoorProfiles: normalised.azureFrontDoorProfiles,
    azureFrontDoorEndpoints: normalised.azureFrontDoorEndpoints,
    azureFrontDoorOriginGroups: normalised.azureFrontDoorOriginGroups,
    azureFrontDoorOrigins: normalised.azureFrontDoorOrigins,
    azureFrontDoorStatusMessage: normalised.azureFrontDoorStatusMessage,
  });
}

function formatBackendError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const marker = "Backend RPC error:";
  if (!message.includes(marker)) {
    return message;
  }
  const payload = message.slice(message.indexOf(marker) + marker.length).trim();
  try {
    const parsed = JSON.parse(payload) as { message?: string };
    if (parsed.message) {
      return parsed.message;
    }
  } catch {
    // Use the raw message when the RPC wrapper is not JSON.
  }
  return message;
}

function frontDoorTopologyLoaded(
  workspace: WorkspaceSnapshot,
  sessionProfileId: string,
): boolean {
  if (!sessionProfileId || workspace.profile?.profileId !== sessionProfileId) {
    return false;
  }
  const profileName =
    workspace.selectedAzureFrontDoorProfile?.trim() ||
    workspace.azureFrontDoorProfiles?.[0]?.name?.trim() ||
    "";
  if (!profileName || (workspace.azureFrontDoorProfiles?.length ?? 0) === 0) {
    return false;
  }
  const endpoints = workspace.azureFrontDoorEndpoints ?? [];
  if (endpoints.length > 0) {
    return endpoints.some(
      (endpoint) => !endpoint.profileName || endpoint.profileName === profileName,
    );
  }
  const status = workspace.azureFrontDoorStatusMessage ?? "";
  return (
    status.includes("Loaded") ||
    status.includes("No Azure Front Door profiles found")
  );
}

function mergeAzureWafSelection(
  current: WorkspaceSnapshot,
  incoming: WorkspaceSnapshot,
): WorkspaceSnapshot {
  const normalised = normaliseWorkspaceSnapshot(incoming);
  return normaliseWorkspaceSnapshot({
    ...current,
    selectedAzureWafPolicy: normalised.selectedAzureWafPolicy,
    azureLogAnalyticsWorkspaces: normalised.azureLogAnalyticsWorkspaces,
    azureWafLogSchema: normalised.azureWafLogSchema,
    azureWafPolicies: normalised.azureWafPolicies,
    azureWafPolicyDetail: normalised.azureWafPolicyDetail,
    azureWafRuleFireCounts: normalised.azureWafRuleFireCounts,
    azureWafStatusMessage: normalised.azureWafStatusMessage,
  });
}

function mergeAzureLogAnalyticsInventory(
  current: WorkspaceSnapshot,
  incoming: WorkspaceSnapshot,
): WorkspaceSnapshot {
  const normalised = normaliseWorkspaceSnapshot(incoming);
  return normaliseWorkspaceSnapshot({
    ...current,
    selectedAzureLogWorkspace: normalised.selectedAzureLogWorkspace,
    azureLogAnalyticsWorkspaces: normalised.azureLogAnalyticsWorkspaces,
    azureLogAnalyticsStatusMessage: normalised.azureLogAnalyticsStatusMessage,
  });
}

function mergeAzureEntraInventory(
  current: WorkspaceSnapshot,
  incoming: WorkspaceSnapshot,
): WorkspaceSnapshot {
  const normalised = normaliseWorkspaceSnapshot(incoming);
  return normaliseWorkspaceSnapshot({
    ...current,
    azureEntraUsers: normalised.azureEntraUsers,
    azureEntraGroups: normalised.azureEntraGroups,
    azureEntraApps: normalised.azureEntraApps,
    azureEntraStatusMessage: normalised.azureEntraStatusMessage,
  });
}

function mergeAzureInventoryScope(
  current: WorkspaceSnapshot,
  incoming: WorkspaceSnapshot,
  scope: string,
): WorkspaceSnapshot {
  switch (scope) {
    case "storage":
      return mergeAzureStorageSelection(current, incoming);
    case "webapps":
      return mergeAzureResourceGroupSelection(current, incoming);
    case "functions":
      return mergeAzureFunctionsSelection(current, incoming);
    case "keyvault":
      return mergeAzureKeyVaultSelection(current, incoming);
    case "cosmos":
      return mergeAzureCosmosSelection(current, incoming);
    case "waf":
      return mergeAzureWafSelection(current, incoming);
    case "frontdoor":
      return mergeAzureFrontDoorSelection(current, incoming);
    case "queues":
      return mergeAzureQueuesSelection(current, incoming);
    case "loganalytics":
      return mergeAzureLogAnalyticsInventory(current, incoming);
    case "entra":
      return mergeAzureEntraInventory(current, incoming);
    default:
      return normaliseWorkspaceSnapshot(incoming);
  }
}

function mergeAzureQueuesSelection(
  current: WorkspaceSnapshot,
  incoming: WorkspaceSnapshot,
): WorkspaceSnapshot {
  const normalised = normaliseWorkspaceSnapshot(incoming);
  return normaliseWorkspaceSnapshot({
    ...current,
    selectedAzureStorageAccount: normalised.selectedAzureStorageAccount,
    selectedAzureQueue: normalised.selectedAzureQueue,
    azureStorageAccounts: normalised.azureStorageAccounts,
    azureStorageQueues: normalised.azureStorageQueues,
    azureQueueMessages: normalised.azureQueueMessages,
    azureQueuesStatusMessage: normalised.azureQueuesStatusMessage,
    azureStorageStatusMessage: normalised.azureStorageStatusMessage,
  });
}

function mergeAwsS3Selection(
  current: WorkspaceSnapshot,
  incoming: WorkspaceSnapshot,
): WorkspaceSnapshot {
  const normalised = normaliseWorkspaceSnapshot(incoming);
  return normaliseWorkspaceSnapshot({
    ...current,
    selectedS3BucketName: normalised.selectedS3BucketName,
    selectedS3ObjectKey: normalised.selectedS3ObjectKey,
    s3PrefixFilter: normalised.s3PrefixFilter,
    s3Buckets: normalised.s3Buckets,
    s3Objects: normalised.s3Objects,
    s3ObjectMetadata: normalised.s3ObjectMetadata,
  });
}

function applySessionWriteModeToWorkspace(
  workspace: WorkspaceSnapshot,
  session: SessionSnapshot,
): WorkspaceSnapshot {
  if (!session.isLocked) {
    return workspace;
  }
  if (session.lockedProviderId === "azure") {
    const writeMode = Boolean(session.azureWriteModeEnabled);
    return {
      ...workspace,
      azureWriteModeEnabled: writeMode,
      azureWritesEnabled: writeMode && workspace.azureWriteCapable,
    };
  }
  if (session.lockedProviderId === "aws") {
    const writeMode = Boolean(session.awsWriteModeEnabled);
    return {
      ...workspace,
      awsWriteModeEnabled: writeMode,
      awsWritesEnabled: writeMode && workspace.awsWriteCapable,
    };
  }
  return workspace;
}

function normaliseWorkspaceSnapshot(snapshot: Partial<WorkspaceSnapshot> | null | undefined): WorkspaceSnapshot {
  const source = snapshot ?? {};
  const dockerRuntime = source.dockerRuntime ?? emptyWorkspace.dockerRuntime;
  const dockerDiagnostics = source.dockerDiagnostics ?? emptyWorkspace.dockerDiagnostics;

  return {
    ...emptyWorkspace,
    ...source,
    provider: source.provider ? normaliseProvider(source.provider) : undefined,
    profile: source.profile ? normaliseProfile(source.profile) : undefined,
    runtimeSettings: {
      ...emptySettings,
      ...(source.runtimeSettings ?? {}),
    },
    environmentDiagnostics: normaliseArray(source.environmentDiagnostics),
    azureCliExtensions: normaliseArray(source.azureCliExtensions),
    dockerDiagnostics: {
      ...emptyWorkspace.dockerDiagnostics,
      ...dockerDiagnostics,
      details: normaliseArray(dockerDiagnostics.details),
    },
    dockerRuntime: {
      ...emptyWorkspace.dockerRuntime,
      ...dockerRuntime,
      resourceOwnership: {
        ...emptyWorkspace.dockerRuntime.resourceOwnership,
        ...(dockerRuntime.resourceOwnership ?? {}),
      },
      details: normaliseArray(dockerRuntime.details),
    },
    dockerResources: normaliseArray(source.dockerResources).map(normaliseDockerResource),
    emulatorSummaries: ensureEmulatorSummaries(normaliseArray(source.emulatorSummaries).map(normaliseEmulatorSummary)),
    localConfigArtifacts: normaliseArray(source.localConfigArtifacts).map(normaliseLocalConfigArtifact),
    awsWriteCapable: source.awsWriteCapable ?? false,
    awsWriteModeEnabled: source.awsWriteModeEnabled ?? false,
    awsWritesEnabled: source.awsWritesEnabled ?? false,
    azureWriteCapable: source.azureWriteCapable ?? false,
    azureWriteModeEnabled: source.azureWriteModeEnabled ?? false,
    azureWritesEnabled: source.azureWritesEnabled ?? false,
    azureResourceGroups: normaliseArray(source.azureResourceGroups).map(normaliseAzureResourceGroup),
    azureVirtualMachines: normaliseArray(source.azureVirtualMachines).map(normaliseAzureVirtualMachine),
    azureStorageAccounts: normaliseArray(source.azureStorageAccounts).map(normaliseAzureStorageAccount),
    azureBlobContainers: normaliseArray(source.azureBlobContainers).map(normaliseAzureBlobContainer),
    azureBlobs: normaliseArray(source.azureBlobs).map(normaliseAzureBlob),
    azureBlobMetadata: normaliseDetailFields(source.azureBlobMetadata),
    azureWebApps: normaliseArray(source.azureWebApps).map(normaliseAzureWebApp),
    azureWebAppActiveDetail: source.azureWebAppActiveDetail
      ? normaliseAzureWebApp(source.azureWebAppActiveDetail)
      : undefined,
    azureAppServicePlans: normaliseArray(source.azureAppServicePlans).map(normaliseAzureAppServicePlan),
    azureWebAppSettings: normaliseArray(source.azureWebAppSettings).map(normaliseAzureWebAppSetting),
    azureWebAppDeploymentSlots: normaliseArray(source.azureWebAppDeploymentSlots),
    azureLogAnalyticsWorkspaces: normaliseArray(source.azureLogAnalyticsWorkspaces),
    azureWafPolicies: normaliseArray(source.azureWafPolicies),
    azureWafRuleFireCounts: normaliseArray(source.azureWafRuleFireCounts),
    azureFunctionApps: normaliseArray(source.azureFunctionApps),
    azureFunctions: normaliseArray(source.azureFunctions),
    azureKeyVaults: normaliseArray(source.azureKeyVaults),
    azureKeyVaultSecrets: normaliseArray(source.azureKeyVaultSecrets),
    azureCosmosAccounts: normaliseArray(source.azureCosmosAccounts),
    azureCosmosDatabases: normaliseArray(source.azureCosmosDatabases),
    azureCosmosContainers: normaliseArray(source.azureCosmosContainers),
    azureCosmosItems: normaliseArray(source.azureCosmosItems),
    azureFrontDoorProfiles: normaliseArray(source.azureFrontDoorProfiles),
    azureFrontDoorEndpoints: normaliseArray(source.azureFrontDoorEndpoints),
    azureFrontDoorOriginGroups: normaliseArray(source.azureFrontDoorOriginGroups),
    azureFrontDoorOrigins: normaliseArray(source.azureFrontDoorOrigins),
    azureStorageQueues: normaliseArray(source.azureStorageQueues),
    azureQueueMessages: normaliseArray(source.azureQueueMessages),
    azureEntraUsers: normaliseArray(source.azureEntraUsers),
    azureEntraGroups: normaliseArray(source.azureEntraGroups),
    azureEntraApps: normaliseArray(source.azureEntraApps),
    s3Buckets: normaliseArray(source.s3Buckets).map(normaliseS3Bucket),
    s3Objects: normaliseArray(source.s3Objects).map(normaliseS3Object),
    s3ObjectMetadata: normaliseDetailFields(source.s3ObjectMetadata),
    s3ExportSnippets: normaliseArray(source.s3ExportSnippets).map(normaliseS3ExportSnippet),
    ec2Regions: normaliseArray(source.ec2Regions),
    ec2Instances: normaliseArray(source.ec2Instances).map(normaliseEC2Instance),
    lambdaRegions: normaliseArray(source.lambdaRegions),
    lambdaFunctions: normaliseArray(source.lambdaFunctions).map(normaliseLambdaFunction),
    dynamodbRegions: normaliseArray(source.dynamodbRegions),
    dynamodbTables: normaliseArray(source.dynamodbTables).map(normaliseDynamoDBTable),
    sqsRegions: normaliseArray(source.sqsRegions),
    sqsQueues: normaliseArray(source.sqsQueues).map(normaliseSqsQueue),
    snsRegions: normaliseArray(source.snsRegions),
    snsTopics: normaliseArray(source.snsTopics).map(normaliseSnsTopic),
    rdsRegions: normaliseArray(source.rdsRegions),
    rdsInstances: normaliseArray(source.rdsInstances).map(normaliseRdsInstance),
    logsRegions: normaliseArray(source.logsRegions),
    logGroups: normaliseArray(source.logGroups).map(normaliseLogGroup),
    iamRoles: normaliseArray(source.iamRoles).map(normaliseIamRole),
    iamPolicies: normaliseArray(source.iamPolicies).map(normaliseIamPolicy),
  };
}

const emptySession: SessionSnapshot = {
  isLocked: false,
  availableAuthMethods: [],
  workspaceTabs: [],
};

// Tabs that do not render provider inventory, so they never show the
// first-load skeleton (they have their own content regardless of the fetch).
const NON_INVENTORY_TABS = new Set(["debug", "deploy", "actions", "virtualisation"]);

const emptySettings: AppSettingsSnapshot = {
  platformName: "",
  configDir: "",
  databasePath: "",
  logPath: "",
  runtimeMode: "cloud",
  localConfigDir: "",
  emulatorStateDir: "",
  localStackImage: "",
  flociAzImage: "",
};

const emptyWorkspace: WorkspaceSnapshot = {
  environmentDiagnostics: [],
  dockerDiagnostics: {
    engineState: "unknown",
    summary: "Docker runtime was not detected.",
    details: [],
  },
  dockerRuntime: {
    reachable: false,
    resourceOwnership: {
      labelKey: "",
      labelValue: "",
      projectLabelKey: "",
      projectName: "",
      summary: "",
    },
    summary: "Docker runtime was not detected.",
    details: [],
  },
  dockerResources: [],
  emulatorSummaries: [],
  localConfigArtifacts: [],
  awsWriteCapable: false,
  awsWriteModeEnabled: false,
  awsWritesEnabled: false,
  azureWriteCapable: false,
  azureWriteModeEnabled: false,
  azureWritesEnabled: false,
  azureCliExtensions: [],
  azureResourceGroups: [],
  azureVirtualMachines: [],
  azureStorageAccounts: [],
  azureBlobContainers: [],
  azureBlobs: [],
  azureBlobMetadata: [],
  azureWebApps: [],
  azureAppServicePlans: [],
  azureWebAppSettings: [],
  azureWebAppDeploymentSlots: [],
  azureLogAnalyticsWorkspaces: [],
  azureWafPolicies: [],
  azureWafRuleFireCounts: [],
  azureFunctionApps: [],
  azureFunctions: [],
  azureKeyVaults: [],
  azureKeyVaultSecrets: [],
  azureCosmosAccounts: [],
  azureCosmosDatabases: [],
  azureCosmosContainers: [],
  azureCosmosItems: [],
  azureFrontDoorProfiles: [],
  azureFrontDoorEndpoints: [],
  azureFrontDoorOriginGroups: [],
  azureFrontDoorOrigins: [],
  azureStorageQueues: [],
  azureQueueMessages: [],
  azureEntraUsers: [],
  azureEntraGroups: [],
  azureEntraApps: [],
  s3Buckets: [],
  s3Objects: [],
  s3ObjectMetadata: [],
  s3ExportSnippets: [],
  ec2Regions: [],
  ec2Instances: [],
  lambdaRegions: [],
  lambdaFunctions: [],
  dynamodbRegions: [],
  dynamodbTables: [],
  sqsRegions: [],
  sqsQueues: [],
  snsRegions: [],
  snsTopics: [],
  rdsRegions: [],
  rdsInstances: [],
  logsRegions: [],
  logGroups: [],
  iamRoles: [],
  iamPolicies: [],
  runtimeSettings: emptySettings,
};

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
  const azureInventoryFetchDepthRef = useRef(0);

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
          if (isWorkspaceSnapshot(job.result)) {
            const workspaceResult = normaliseWorkspaceSnapshot(job.result);
            startTransition(() => {
              setWorkspace(workspaceResult);
              setWorkspaceLoaded(true);
            });
            resetWorkspaceFetch();
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
    if (
      selected &&
      current.azureWafPolicyDetail?.name === selected &&
      current.profile?.profileId === sessionProfileId
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
    // The refresh runs as a backend job; the new workspace arrives via a
    // "job.updated" event, which clears workspace loading. Show the indicator
    // straight away, and clear it if the job fails to even start.
    beginWorkspaceFetch();
    try {
      await backendRequest<JobStatus>("actions.invoke", {
        actionId: "refresh",
      });
    } catch (error) {
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
    />
  ) : session.isLocked && activeWorkspaceTabId === "sns" ? (
    <SNSView
      workspace={activeWorkspace}
      actionStatus={snsActionStatus}
      onRefresh={refreshSNSInventory}
      onSelectRegion={selectSNSRegion}
      onSelectEntity={selectSNSTopic}
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
      inventoryLoading={azureInventoryLoading}
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
      inventoryLoading={azureInventoryLoading}
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
  ) : session.isLocked && activeWorkspaceTabId === "azure-log-analytics" ? (
    <LogAnalyticsView
      workspace={activeWorkspace}
      workspaceSelectionLoading={azureLogWorkspaceSelectionLoading}
      initialQuery={logAnalyticsPrefill?.query}
      initialTimespan={logAnalyticsPrefill?.timespan}
      onSelectWorkspace={(ws) => {
        void selectAzureLogAnalyticsWorkspace(ws);
      }}
      onRunQuery={(ws, query, timespan) =>
        backendRequest<AzureLogQueryResult>("azure.logAnalytics.query", {
          workspace: ws,
          query,
          timespan,
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
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-waf" ? (
    <AzureWafView
      workspace={activeWorkspace}
      workspaceSelectionLoading={azureLogWorkspaceSelectionLoading}
      configLoading={azureWafConfigLoading || azureInventoryLoading}
      onSelectWorkspace={(ws) => {
        void selectAzureLogAnalyticsWorkspace(ws);
      }}
      onSelectPolicy={(policyName) => {
        void selectAzureWafPolicy(policyName);
      }}
      onRunQuery={(ws, query, timespan) =>
        backendRequest<AzureLogQueryResult>("azure.logAnalytics.query", {
          workspace: ws,
          query,
          timespan,
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
      inventoryLoading={azureInventoryLoading || azureFrontDoorTopologyLoading}
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
  ) : session.isLocked && activeWorkspaceTabId === "azure-queues" ? (
    <AzureQueuesView
      workspace={activeWorkspace}
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
    <AzureEntraView workspace={activeWorkspace} />
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
    ...providers.map((provider) => ({
      id: provider.providerId,
      label: provider.profileCount
        ? `${provider.label} · ${provider.profileCount} profile${provider.profileCount === 1 ? "" : "s"}`
        : provider.label,
      provider: provider.providerId,
      status: providerStatus(provider),
      kind: "provider" as const,
    })),
    {
      id: "local",
      label: "Local Runtime",
      status: (dockerReachable ? "on" : "off") as Status,
      kind: "local" as const,
    },
    {
      id: "deploy",
      label: "Deploy",
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
    const tabItems = session.workspaceTabs.map((tab) => {
      const item = navItemForTab(tab, workspace);
      if (countsPending && item.count != null) {
        return { ...item, count: undefined, countLoading: true };
      }
      return item;
    });
    const overviewItems = tabItems.filter((item) => item.id === "overview");
    const serviceItems = tabItems.filter((item) => item.id !== "overview");
    const groups: NavGroup[] = [];
    if (overviewItems.length > 0) {
      groups.push({ label: "Workspace", items: overviewItems });
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
    groups.push({ label: "Tools", items: [{ id: "debug", label: "Debug console", icon: Bug }] });
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
      group.items.map((item) => ({
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
            userInitials="AS"
            showVersion={sidebarCollapsed || isTablet}
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
              <>
                {session.isLocked ? (
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
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setResetModalOpen(true);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-[18px]" />
                  <span className="truncate">Reset app data</span>
                </button>
              </>
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

function providerStatus(provider: ProviderSummary): Status {
  switch (provider.state) {
    case "configured":
      return "on";
    case "tooling-only":
      return "warning";
    default:
      return "off";
  }
}

function authLabel(method?: AuthMethod): string | undefined {
  if (method === "cli") {
    return "CLI";
  }
  if (method === "sso") {
    return "SSO";
  }
  if (method === "local-files") {
    return "Local files";
  }
  return undefined;
}

function viewLabelFor(tabId: string, tabs: WorkspaceTab[]): string {
  const labels: Record<string, string> = {
    overview: "Overview",
    virtualisation: "Local Runtime",
    debug: "Debug console",
    s3: "Storage",
    ec2: "Compute",
    lambda: "Lambda",
    dynamodb: "DynamoDB",
    sqs: "SQS",
    sns: "SNS",
    rds: "RDS",
    logs: "Logs",
    iam: "IAM",
    "azure-overview": "Azure",
    "azure-resource-groups": "Resource groups",
    "azure-vms": "Virtual machines",
    "azure-storage": "Storage",
    "azure-app-service": "App Service",
    "azure-log-analytics": "Log Analytics",
    "azure-waf": "WAF",
    "azure-front-door": "Front Door",
    "azure-functions": "Functions",
    "azure-key-vault": "Key Vault",
    "azure-cosmos": "Cosmos DB",
    "azure-queues": "Queues",
    "azure-entra": "Entra ID",
    actions: "Activity",
  };
  return labels[tabId] ?? tabs.find((tab) => tab.tabId === tabId)?.label ?? "Workspace";
}

function navItemForTab(tab: WorkspaceTab, workspace: WorkspaceSnapshot): NavItem {
  const base: NavItem = { id: tab.tabId, label: tab.label };
  switch (tab.tabId) {
    case "overview":
      return { ...base, icon: LayoutGrid };
    case "s3":
      return { ...base, iconUrl: awsS3IconUrl, count: workspace.s3Buckets.length };
    case "ec2":
      return { ...base, iconUrl: awsEc2IconUrl, count: workspace.ec2Instances.length };
    case "lambda":
      return { ...base, iconUrl: awsLambdaIconUrl, count: workspace.lambdaFunctions.length };
    case "dynamodb":
      return { ...base, iconUrl: awsDynamodbIconUrl, count: workspace.dynamodbTables.length };
    case "sqs":
      return { ...base, iconUrl: awsSqsIconUrl, count: workspace.sqsQueues.length };
    case "sns":
      return { ...base, iconUrl: awsSnsIconUrl, count: workspace.snsTopics.length };
    case "rds":
      return { ...base, iconUrl: awsRdsIconUrl, count: workspace.rdsInstances.length };
    case "logs":
      return { ...base, iconUrl: awsCloudwatchIconUrl, count: workspace.logGroups.length };
    case "iam":
      return { ...base, iconUrl: awsIamIconUrl, count: workspace.iamRoles.length };
    case "azure-overview":
      return { ...base, iconUrl: azureIconUrl, count: workspace.azureResourceGroups.length };
    case "azure-resource-groups":
      return { ...base, iconUrl: azureResourceGroupsIconUrl, count: workspace.azureResourceGroups.length };
    case "azure-vms":
      return { ...base, iconUrl: azureVmIconUrl, count: workspace.azureVirtualMachines.length };
    case "azure-storage":
      return {
        ...base,
        iconUrl: azureStorageIconUrl,
        count:
          workspace.azureBlobContainers.length > 0
            ? workspace.azureBlobContainers.length
            : workspace.azureStorageAccounts.length,
      };
    case "azure-app-service":
      return { ...base, iconUrl: azureAppServiceIconUrl, count: workspace.azureWebApps.length };
    case "azure-log-analytics":
      return { ...base, iconUrl: azureLogAnalyticsIconUrl, count: workspace.azureLogAnalyticsWorkspaces.length };
    case "azure-waf":
      return { ...base, iconUrl: azureWafIconUrl, count: workspace.azureWafPolicies.length };
    case "azure-front-door":
      return { ...base, iconUrl: azureWafIconUrl, count: workspace.azureFrontDoorProfiles.length };
    case "azure-functions":
      return { ...base, iconUrl: azureFunctionsIconUrl, count: workspace.azureFunctionApps.length };
    case "azure-key-vault":
      return { ...base, iconUrl: azureKeyVaultIconUrl, count: workspace.azureKeyVaults.length };
    case "azure-cosmos":
      return { ...base, iconUrl: azureCosmosIconUrl, count: workspace.azureCosmosAccounts.length };
    case "azure-queues":
      return { ...base, iconUrl: azureQueuesIconUrl, count: workspace.azureStorageQueues.length };
    case "azure-entra":
      return { ...base, iconUrl: azureEntraIconUrl, count: workspace.azureEntraUsers.length };
    case "actions":
      return { ...base, icon: Boxes };
    case "virtualisation":
      return { ...base, icon: Server, count: workspace.emulatorSummaries.length };
    case "debug":
      return { ...base, icon: Bug };
    default:
      return { ...base, icon: Boxes };
  }
}

const LOG_TONE: Record<string, Status> = {
  error: "error",
  warn: "warning",
  warning: "warning",
  success: "on",
  info: "off",
  debug: "off",
};

function logTone(level: string): Status {
  return LOG_TONE[level?.toLowerCase?.() ?? ""] ?? "off";
}

function formatLogTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleTimeString("en-GB");
}

function toActivityEntries(logs: ActivityLogEntry[]): ActivityEntry[] {
  return logs.map((entry) => ({
    id: entry.id,
    timestamp: formatLogTime(entry.timestamp),
    message: entry.message,
    detail: entry.details,
    tone: logTone(entry.level),
  }));
}

function dockerDiagnosticsFromRuntime(runtime: DockerRuntimeSnapshot): WorkspaceSnapshot["dockerDiagnostics"] {
  return {
    engineState: runtime.reachable ? "available" : runtime.host ? "unavailable" : "unknown",
    summary: runtime.summary,
    details: runtime.details,
    contextName: runtime.contextName,
    host: runtime.host,
  };
}

function normaliseEmulatorLogSnapshot(snapshot: Partial<EmulatorLogSnapshot> | null | undefined): EmulatorLogSnapshot {
  return {
    emulatorId: snapshot?.emulatorId ?? "localstack",
    lines: normaliseArray(snapshot?.lines).map((line) => String(line)),
    summary: snapshot?.summary ?? "Emulator logs have not been loaded yet.",
  };
}

function emulatorStatusFromWorkspace(workspace: WorkspaceSnapshot, emulatorId: string): EmulatorSummary | undefined {
  return workspace.emulatorSummaries.find((e) => e.emulatorId === emulatorId);
}
