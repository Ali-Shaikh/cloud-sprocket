// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { syncActionCapabilitiesForWriteMode } from "@/lib/action-capabilities";
import type {
  AppSettingsSnapshot,
  AwsDynamoDBTable,
  AwsEc2Instance,
  AwsApiGatewayApi,
  AwsApiGatewayStage,
  AwsSecretsManagerSecret,
  AwsEcsCluster,
  AwsEcsService,
  AwsEcsTask,
  AwsEksCluster,
  AwsEksNodeGroup,
  AwsCloudFormationStack,
  AwsCloudFormationStackEvent,
  AwsEventBridgeBus,
  AwsEventBridgeRule,
  AwsRoute53HostedZone,
  AwsRoute53ResourceRecordSet,
  AwsElbLoadBalancer,
  AwsElbTargetGroup,
  AwsKmsAlias,
  AwsKmsKey,
  AwsIamPolicy,
  AwsIamRole,
  AwsLambdaFunction,
  AwsLogGroup,
  AwsRdsInstance,
  AwsS3Bucket,
  AwsS3ExportSnippet,
  AwsS3Object,
  AwsS3PresignResult,
  AwsS3UploadResult,
  AwsSnsTopic,
  AwsSqsQueue,
  AzureBlob,
  AzureBlobContainer,
  AzureResourceGroup,
  AzureStorageAccount,
  AzureVirtualMachine,
  AzureWebApp,
  AzureAppServicePlan,
  AzureWebAppSetting,
  DetailField,
  EmulatorSummary,
  LocalConfigArtifact,
  ManagedDockerResource,
  ProfileSummary,
  ProviderSummary,
  SessionSnapshot,
  UrlValidationResult,
  WorkspaceSnapshot,
} from "@/types/backend";

export const emptySession: SessionSnapshot = {
  isLocked: false,
  availableAuthMethods: [],
  workspaceTabs: [],
};

// Tabs that do not render provider inventory, so they never show the
// first-load skeleton (they have their own content regardless of the fetch).
export const NON_INVENTORY_TABS = new Set([
  "debug",
  "developer-tools",
  "deploy",
  "actions",
  "virtualisation",
]);

export const emptySettings: AppSettingsSnapshot = {
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

export const emptyWorkspace: WorkspaceSnapshot = {
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
  awsWriteTargetIsLocal: false,
  awsWriteModeEnabled: false,
  awsWritesEnabled: false,
  actionCapabilities: {},
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
  azurePostgresServers: [],
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
  ecsRegions: [],
  ecsClusters: [],
  ecsServices: [],
  ecsTasks: [],
  eksRegions: [],
  eksClusters: [],
  eksNodeGroups: [],
  cloudFormationRegions: [],
  cloudFormationStacks: [],
  cloudFormationStackEvents: [],
  eventBridgeRegions: [],
  eventBridgeBuses: [],
  eventBridgeRules: [],
  route53HostedZones: [],
  route53ResourceRecordSets: [],
  elbRegions: [],
  elbLoadBalancers: [],
  elbTargetGroups: [],
  kmsRegions: [],
  kmsKeys: [],
  kmsAliases: [],
  apiGatewayRegions: [],
  apiGatewayApis: [],
  apiGatewayStages: [],
  secretsManagerRegions: [],
  secretsManagerSecrets: [],
  logsRegions: [],
  logGroups: [],
  iamRoles: [],
  iamPolicies: [],
  runtimeSettings: emptySettings,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isS3UploadResult(value: unknown): value is AwsS3UploadResult {
  return isRecord(value) && typeof value.destinationUri === "string";
}

export function isS3PresignResult(value: unknown): value is AwsS3PresignResult {
  return isRecord(value) && typeof value.url === "string" && typeof value.objectKey === "string";
}

export function isUrlValidationResult(value: unknown): value is UrlValidationResult {
  return isRecord(value) && typeof value.url === "string" && typeof value.summary === "string";
}

export function isWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
  return isRecord(value) && Array.isArray(value.ec2Instances) && typeof value.runtimeSettings === "object";
}

export function normaliseArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function normaliseProvider(provider: ProviderSummary): ProviderSummary {
  return {
    ...provider,
    locations: normaliseArray(provider.locations),
  };
}

export function normaliseProfile(profile: ProfileSummary): ProfileSummary {
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
  return { ...object, isFolder: Boolean(object.isFolder) };
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

function normaliseEcsCluster(cluster: AwsEcsCluster): AwsEcsCluster {
  return { ...cluster };
}

function normaliseEcsService(service: AwsEcsService): AwsEcsService {
  return { ...service };
}

function normaliseEcsTask(task: AwsEcsTask): AwsEcsTask {
  return {
    ...task,
    containers: normaliseArray(task.containers),
  };
}

function normaliseEksCluster(cluster: AwsEksCluster): AwsEksCluster {
  return {
    ...cluster,
    clusterArn: cluster.clusterArn ?? "",
    clusterName: cluster.clusterName ?? "",
  };
}

function normaliseEksNodeGroup(nodeGroup: AwsEksNodeGroup): AwsEksNodeGroup {
  return {
    ...nodeGroup,
    instanceTypes: normaliseArray(nodeGroup.instanceTypes),
  };
}

function normaliseCloudFormationStack(stack: AwsCloudFormationStack): AwsCloudFormationStack {
  return {
    ...stack,
    stackId: stack.stackId ?? "",
    stackName: stack.stackName ?? "",
  };
}

function normaliseCloudFormationStackEvent(
  event: AwsCloudFormationStackEvent,
): AwsCloudFormationStackEvent {
  return {
    ...event,
    eventId: event.eventId ?? "",
  };
}

function normaliseEventBridgeBus(bus: AwsEventBridgeBus): AwsEventBridgeBus {
  return {
    ...bus,
    name: bus.name ?? "",
  };
}

function normaliseEventBridgeRule(rule: AwsEventBridgeRule): AwsEventBridgeRule {
  return {
    ...rule,
    name: rule.name ?? "",
  };
}

function normaliseRoute53HostedZone(zone: AwsRoute53HostedZone): AwsRoute53HostedZone {
  return {
    ...zone,
    hostedZoneId: zone.hostedZoneId ?? "",
    name: zone.name ?? "",
  };
}

function normaliseRoute53ResourceRecordSet(
  record: AwsRoute53ResourceRecordSet,
): AwsRoute53ResourceRecordSet {
  return {
    ...record,
    name: record.name ?? "",
    values: normaliseArray(record.values),
  };
}

function normaliseElbLoadBalancer(loadBalancer: AwsElbLoadBalancer): AwsElbLoadBalancer {
  return {
    ...loadBalancer,
    loadBalancerArn: loadBalancer.loadBalancerArn ?? "",
    loadBalancerName: loadBalancer.loadBalancerName ?? "",
  };
}

function normaliseElbTargetGroup(targetGroup: AwsElbTargetGroup): AwsElbTargetGroup {
  return {
    ...targetGroup,
    targetGroupArn: targetGroup.targetGroupArn ?? "",
    targetGroupName: targetGroup.targetGroupName ?? "",
  };
}

function normaliseKmsKey(key: AwsKmsKey): AwsKmsKey {
  return {
    ...key,
    keyId: key.keyId ?? "",
  };
}

function normaliseKmsAlias(alias: AwsKmsAlias): AwsKmsAlias {
  return {
    ...alias,
    aliasName: alias.aliasName ?? "",
  };
}

function normaliseApiGatewayApi(api: AwsApiGatewayApi): AwsApiGatewayApi {
  return { ...api };
}

function normaliseApiGatewayStage(stage: AwsApiGatewayStage): AwsApiGatewayStage {
  return { ...stage };
}

function normaliseSecretsManagerSecret(secret: AwsSecretsManagerSecret): AwsSecretsManagerSecret {
  return { ...secret };
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

export function normaliseSessionSnapshot(session: Partial<SessionSnapshot> | null | undefined): SessionSnapshot {
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

export function mergeAzureResourceGroupSelection(
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

export function mergeAzureStorageSelection(
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

export function mergeAzureFunctionsSelection(
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

export function mergeAzureKeyVaultSelection(
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

export function mergeAzureCosmosSelection(
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

export function mergeAzurePostgresSelection(
  current: WorkspaceSnapshot,
  incoming: WorkspaceSnapshot,
): WorkspaceSnapshot {
  const normalised = normaliseWorkspaceSnapshot(incoming);
  return normaliseWorkspaceSnapshot({
    ...current,
    selectedAzurePostgresServer: normalised.selectedAzurePostgresServer,
    azurePostgresServers: normalised.azurePostgresServers,
    azurePostgresConnection: normalised.azurePostgresConnection,
    azurePostgresStatusMessage: normalised.azurePostgresStatusMessage,
  });
}

export function mergeAzureFrontDoorSelection(
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

export function formatBackendError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : error &&
          typeof error === "object" &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : String(error);
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

export function frontDoorTopologyLoaded(
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

export function mergeAzureWafSelection(
  current: WorkspaceSnapshot,
  incoming: WorkspaceSnapshot,
): WorkspaceSnapshot {
  const normalised = normaliseWorkspaceSnapshot(incoming);
  return normaliseWorkspaceSnapshot({
    ...current,
    selectedAzureWafPolicy: normalised.selectedAzureWafPolicy,
    selectedAzureLogWorkspace: normalised.selectedAzureLogWorkspace ?? current.selectedAzureLogWorkspace,
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

export function mergeAzureInventoryScope(
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
    case "postgres":
      return mergeAzurePostgresSelection(current, incoming);
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

export function mergeAzureQueuesSelection(
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

export function mergeAwsS3Selection(
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
    s3ObjectsNextToken: normalised.s3ObjectsNextToken,
    s3ObjectsHasMore: normalised.s3ObjectsHasMore,
    s3ObjectMetadata: normalised.s3ObjectMetadata,
    s3ExportSnippets: normalised.s3ExportSnippets,
    s3StatusMessage: normalised.s3StatusMessage,
  });
}

/**
 * Object selection re-lists page 1 on the backend. Keep any Load more pages
 * already shown, and only take selection + inspector fields from the response.
 */
export function mergeAwsS3ObjectSelection(
  current: WorkspaceSnapshot,
  incoming: WorkspaceSnapshot,
): WorkspaceSnapshot {
  const normalised = normaliseWorkspaceSnapshot(incoming);
  return normaliseWorkspaceSnapshot({
    ...current,
    selectedS3ObjectKey: normalised.selectedS3ObjectKey,
    s3ObjectMetadata: normalised.s3ObjectMetadata,
    s3ExportSnippets: normalised.s3ExportSnippets,
    s3StatusMessage: normalised.s3StatusMessage || current.s3StatusMessage,
  });
}

/** Append a Load more page onto the current S3 object list. */
export function mergeAwsS3LoadMore(
  current: WorkspaceSnapshot,
  incoming: WorkspaceSnapshot,
): WorkspaceSnapshot {
  const normalised = normaliseWorkspaceSnapshot(incoming);
  const seen = new Set(current.s3Objects.map((object) => object.key));
  const appended = [
    ...current.s3Objects,
    ...normalised.s3Objects.filter((object) => !seen.has(object.key)),
  ];
  return normaliseWorkspaceSnapshot({
    ...current,
    s3Objects: appended,
    s3ObjectsNextToken: normalised.s3ObjectsNextToken,
    s3ObjectsHasMore: normalised.s3ObjectsHasMore,
    s3StatusMessage: normalised.s3StatusMessage || current.s3StatusMessage,
  });
}

export function mergeAwsInventoryScope(
  current: WorkspaceSnapshot,
  incoming: WorkspaceSnapshot,
  scope: string,
): WorkspaceSnapshot {
  const normalised = normaliseWorkspaceSnapshot(incoming);
  switch (scope) {
    case "s3":
      return mergeAwsS3Selection(current, incoming);
    case "ec2":
      return normaliseWorkspaceSnapshot({
        ...current,
        selectedEc2Region: normalised.selectedEc2Region,
        selectedEc2InstanceId: normalised.selectedEc2InstanceId,
        ec2Regions: normalised.ec2Regions,
        ec2Instances: normalised.ec2Instances,
        ec2StatusMessage: normalised.ec2StatusMessage,
      });
    case "lambda":
      return normaliseWorkspaceSnapshot({
        ...current,
        selectedLambdaRegion: normalised.selectedLambdaRegion,
        selectedLambdaFunctionName: normalised.selectedLambdaFunctionName,
        lambdaRegions: normalised.lambdaRegions,
        lambdaFunctions: normalised.lambdaFunctions,
        lambdaStatusMessage: normalised.lambdaStatusMessage,
      });
    case "dynamodb":
      return normaliseWorkspaceSnapshot({
        ...current,
        selectedDynamodbRegion: normalised.selectedDynamodbRegion,
        selectedDynamodbTableName: normalised.selectedDynamodbTableName,
        dynamodbRegions: normalised.dynamodbRegions,
        dynamodbTables: normalised.dynamodbTables,
        dynamodbStatusMessage: normalised.dynamodbStatusMessage,
      });
    case "sqs":
      return normaliseWorkspaceSnapshot({
        ...current,
        selectedSqsRegion: normalised.selectedSqsRegion,
        selectedSqsQueueUrl: normalised.selectedSqsQueueUrl,
        sqsRegions: normalised.sqsRegions,
        sqsQueues: normalised.sqsQueues,
        sqsStatusMessage: normalised.sqsStatusMessage,
      });
    case "sns":
      return normaliseWorkspaceSnapshot({
        ...current,
        selectedSnsRegion: normalised.selectedSnsRegion,
        selectedSnsTopicArn: normalised.selectedSnsTopicArn,
        snsRegions: normalised.snsRegions,
        snsTopics: normalised.snsTopics,
        snsStatusMessage: normalised.snsStatusMessage,
      });
    case "rds":
      return normaliseWorkspaceSnapshot({
        ...current,
        selectedRdsRegion: normalised.selectedRdsRegion,
        selectedRdsInstanceId: normalised.selectedRdsInstanceId,
        rdsRegions: normalised.rdsRegions,
        rdsInstances: normalised.rdsInstances,
        rdsStatusMessage: normalised.rdsStatusMessage,
      });
    case "ecs":
      return normaliseWorkspaceSnapshot({
        ...current,
        selectedEcsRegion: normalised.selectedEcsRegion,
        selectedEcsClusterArn: normalised.selectedEcsClusterArn,
        selectedEcsServiceArn: normalised.selectedEcsServiceArn,
        selectedEcsTaskArn: normalised.selectedEcsTaskArn,
        ecsRegions: normalised.ecsRegions,
        ecsClusters: normalised.ecsClusters,
        ecsServices: normalised.ecsServices,
        ecsTasks: normalised.ecsTasks,
        ecsStatusMessage: normalised.ecsStatusMessage,
      });
    case "eks":
      return normaliseWorkspaceSnapshot({
        ...current,
        selectedEksRegion: normalised.selectedEksRegion,
        selectedEksClusterName: normalised.selectedEksClusterName,
        eksRegions: normalised.eksRegions,
        eksClusters: normalised.eksClusters,
        eksNodeGroups: normalised.eksNodeGroups,
        eksStatusMessage: normalised.eksStatusMessage,
      });
    case "cloudformation":
      return normaliseWorkspaceSnapshot({
        ...current,
        selectedCloudFormationRegion: normalised.selectedCloudFormationRegion,
        selectedCloudFormationStackName: normalised.selectedCloudFormationStackName,
        cloudFormationRegions: normalised.cloudFormationRegions,
        cloudFormationStacks: normalised.cloudFormationStacks,
        cloudFormationStackEvents: normalised.cloudFormationStackEvents,
        cloudFormationStatusMessage: normalised.cloudFormationStatusMessage,
      });
    case "eventbridge":
      return normaliseWorkspaceSnapshot({
        ...current,
        selectedEventBridgeRegion: normalised.selectedEventBridgeRegion,
        selectedEventBridgeBusName: normalised.selectedEventBridgeBusName,
        eventBridgeRegions: normalised.eventBridgeRegions,
        eventBridgeBuses: normalised.eventBridgeBuses,
        eventBridgeRules: normalised.eventBridgeRules,
        eventBridgeStatusMessage: normalised.eventBridgeStatusMessage,
      });
    case "route53":
      return normaliseWorkspaceSnapshot({
        ...current,
        selectedRoute53HostedZoneId: normalised.selectedRoute53HostedZoneId,
        route53HostedZones: normalised.route53HostedZones,
        route53ResourceRecordSets: normalised.route53ResourceRecordSets,
        route53StatusMessage: normalised.route53StatusMessage,
      });
    case "elb":
      return normaliseWorkspaceSnapshot({
        ...current,
        selectedElbRegion: normalised.selectedElbRegion,
        selectedElbLoadBalancerArn: normalised.selectedElbLoadBalancerArn,
        elbRegions: normalised.elbRegions,
        elbLoadBalancers: normalised.elbLoadBalancers,
        elbTargetGroups: normalised.elbTargetGroups,
        elbStatusMessage: normalised.elbStatusMessage,
      });
    case "kms":
      return normaliseWorkspaceSnapshot({
        ...current,
        selectedKmsRegion: normalised.selectedKmsRegion,
        selectedKmsKeyId: normalised.selectedKmsKeyId,
        kmsRegions: normalised.kmsRegions,
        kmsKeys: normalised.kmsKeys,
        kmsAliases: normalised.kmsAliases,
        kmsStatusMessage: normalised.kmsStatusMessage,
      });
    case "apigateway":
      return normaliseWorkspaceSnapshot({
        ...current,
        selectedApiGatewayRegion: normalised.selectedApiGatewayRegion,
        selectedApiGatewayApiKey: normalised.selectedApiGatewayApiKey,
        apiGatewayRegions: normalised.apiGatewayRegions,
        apiGatewayApis: normalised.apiGatewayApis,
        apiGatewayStages: normalised.apiGatewayStages,
        apiGatewayStatusMessage: normalised.apiGatewayStatusMessage,
      });
    case "secrets":
      return normaliseWorkspaceSnapshot({
        ...current,
        selectedSecretsManagerRegion: normalised.selectedSecretsManagerRegion,
        selectedSecretsManagerName: normalised.selectedSecretsManagerName,
        secretsManagerRegions: normalised.secretsManagerRegions,
        secretsManagerSecrets: normalised.secretsManagerSecrets,
        secretsManagerStatusMessage: normalised.secretsManagerStatusMessage,
      });
    case "logs":
      return normaliseWorkspaceSnapshot({
        ...current,
        selectedLogsRegion: normalised.selectedLogsRegion,
        selectedLogGroupName: normalised.selectedLogGroupName,
        logsRegions: normalised.logsRegions,
        logGroups: normalised.logGroups,
        logsStatusMessage: normalised.logsStatusMessage,
      });
    case "iam":
      return normaliseWorkspaceSnapshot({
        ...current,
        selectedIamRoleName: normalised.selectedIamRoleName,
        iamRoles: normalised.iamRoles,
        iamPolicies: normalised.iamPolicies,
        iamStatusMessage: normalised.iamStatusMessage,
      });
    default:
      return current;
  }
}

export function applySessionWriteModeToWorkspace(
  workspace: WorkspaceSnapshot,
  session: SessionSnapshot,
): WorkspaceSnapshot {
  if (!session.isLocked) {
    return workspace;
  }
  if (session.lockedProviderId === "azure") {
    const writeMode = Boolean(session.azureWriteModeEnabled);
    const azureWritesEnabled = writeMode && workspace.azureWriteCapable;
    return {
      ...workspace,
      azureWriteModeEnabled: writeMode,
      azureWritesEnabled,
      actionCapabilities: syncActionCapabilitiesForWriteMode(
        workspace.actionCapabilities,
        "azure",
        azureWritesEnabled,
      ),
    };
  }
  if (session.lockedProviderId === "aws") {
    const writeMode = Boolean(session.awsWriteModeEnabled);
    const awsWritesEnabled = writeMode && workspace.awsWriteCapable;
    return {
      ...workspace,
      awsWriteModeEnabled: writeMode,
      awsWritesEnabled,
      actionCapabilities: syncActionCapabilitiesForWriteMode(
        workspace.actionCapabilities,
        "aws",
        awsWritesEnabled,
      ),
    };
  }
  return workspace;
}

export function normaliseWorkspaceSnapshot(snapshot: Partial<WorkspaceSnapshot> | null | undefined): WorkspaceSnapshot {
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
    awsWriteTargetIsLocal: source.awsWriteTargetIsLocal ?? false,
    awsWriteModeEnabled: source.awsWriteModeEnabled ?? false,
    awsWritesEnabled: source.awsWritesEnabled ?? false,
    actionCapabilities: source.actionCapabilities ?? {},
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
    azurePostgresServers: normaliseArray(source.azurePostgresServers),
    azurePostgresConnection: source.azurePostgresConnection,
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
    s3ObjectsNextToken: source.s3ObjectsNextToken,
    s3ObjectsHasMore: source.s3ObjectsHasMore ?? false,
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
    ecsRegions: normaliseArray(source.ecsRegions),
    ecsClusters: normaliseArray(source.ecsClusters).map(normaliseEcsCluster),
    ecsServices: normaliseArray(source.ecsServices).map(normaliseEcsService),
    ecsTasks: normaliseArray(source.ecsTasks).map(normaliseEcsTask),
    eksRegions: normaliseArray(source.eksRegions),
    eksClusters: normaliseArray(source.eksClusters).map(normaliseEksCluster),
    eksNodeGroups: normaliseArray(source.eksNodeGroups).map(normaliseEksNodeGroup),
    cloudFormationRegions: normaliseArray(source.cloudFormationRegions),
    cloudFormationStacks: normaliseArray(source.cloudFormationStacks).map(normaliseCloudFormationStack),
    cloudFormationStackEvents: normaliseArray(source.cloudFormationStackEvents).map(
      normaliseCloudFormationStackEvent,
    ),
    eventBridgeRegions: normaliseArray(source.eventBridgeRegions),
    eventBridgeBuses: normaliseArray(source.eventBridgeBuses).map(normaliseEventBridgeBus),
    eventBridgeRules: normaliseArray(source.eventBridgeRules).map(normaliseEventBridgeRule),
    route53HostedZones: normaliseArray(source.route53HostedZones).map(normaliseRoute53HostedZone),
    route53ResourceRecordSets: normaliseArray(source.route53ResourceRecordSets).map(
      normaliseRoute53ResourceRecordSet,
    ),
    elbRegions: normaliseArray(source.elbRegions),
    elbLoadBalancers: normaliseArray(source.elbLoadBalancers).map(normaliseElbLoadBalancer),
    elbTargetGroups: normaliseArray(source.elbTargetGroups).map(normaliseElbTargetGroup),
    kmsRegions: normaliseArray(source.kmsRegions),
    kmsKeys: normaliseArray(source.kmsKeys).map(normaliseKmsKey),
    kmsAliases: normaliseArray(source.kmsAliases).map(normaliseKmsAlias),
    apiGatewayRegions: normaliseArray(source.apiGatewayRegions),
    apiGatewayApis: normaliseArray(source.apiGatewayApis).map(normaliseApiGatewayApi),
    apiGatewayStages: normaliseArray(source.apiGatewayStages).map(normaliseApiGatewayStage),
    secretsManagerRegions: normaliseArray(source.secretsManagerRegions),
    secretsManagerSecrets: normaliseArray(source.secretsManagerSecrets).map(
      normaliseSecretsManagerSecret,
    ),
    logsRegions: normaliseArray(source.logsRegions),
    logGroups: normaliseArray(source.logGroups).map(normaliseLogGroup),
    iamRoles: normaliseArray(source.iamRoles).map(normaliseIamRole),
    iamPolicies: normaliseArray(source.iamPolicies).map(normaliseIamPolicy),
  };
}
