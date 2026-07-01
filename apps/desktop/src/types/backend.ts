// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

export type ProviderState = "configured" | "tooling-only" | "missing";
export type AuthMethod = "cli" | "sso" | "local-files";
export type JobLifecycle = "queued" | "running" | "completed" | "failed";
export type LogLevel = "info" | "success" | "warning" | "error";
export type RuntimeMode = "cloud" | "local-emulator";
export type DockerEngineState = "unknown" | "unavailable" | "available";
export type EmulatorStatus =
  | "unknown"
  | "not-configured"
  | "stopped"
  | "running"
  | "unhealthy";

export interface DetailField {
  label: string;
  value: string;
  sensitive?: boolean;
}

export interface AuthMethodStatus {
  method: AuthMethod;
  label: string;
  summary: string;
  available: boolean;
}

export interface ProviderSummary {
  providerId: string;
  label: string;
  state: ProviderState;
  summary: string;
  profileCount: number;
  commandPath?: string;
  locations: string[];
}

export interface ProfileSummary {
  providerId: string;
  profileId: string;
  displayName: string;
  summary: string;
  sourcePaths: string[];
  attributes: DetailField[];
  authMethods: AuthMethodStatus[];
}

export interface WorkspaceTab {
  tabId: string;
  label: string;
  summary: string;
  detail: string;
  category?: "workspace" | "service" | "tool";
}

export interface DockerDiagnostics {
  engineState: DockerEngineState;
  summary: string;
  contextName?: string;
  host?: string;
  details: DetailField[];
}

export interface EmulatorSummary {
  emulatorId: string;
  providerId: string;
  label: string;
  kind: string;
  status: EmulatorStatus;
  summary: string;
  details: DetailField[];
}

export interface LocalConfigArtifact {
  artifactId: string;
  providerId: string;
  label: string;
  path: string;
  status: string;
  managed: boolean;
  summary: string;
}

export interface DockerOwnershipPolicy {
  labelKey: string;
  labelValue: string;
  projectLabelKey: string;
  projectName: string;
  summary: string;
}

/** Local Runtime tab payload without a full workspace rebuild. */
export interface RuntimeSnapshot {
  dockerRuntime: DockerRuntimeSnapshot;
  dockerResources: ManagedDockerResource[];
  emulatorSummaries: EmulatorSummary[];
  dockerDiagnostics: DockerDiagnostics;
}

export interface DockerRuntimeSnapshot {
  reachable: boolean;
  host?: string;
  hostSource?: string;
  contextName?: string;
  serverVersion?: string;
  apiVersion?: string;
  operatingSystem?: string;
  architecture?: string;
  engineName?: string;
  resourceOwnership: DockerOwnershipPolicy;
  summary: string;
  details: DetailField[];
}

export interface ManagedDockerResource {
  resourceId: string;
  kind: string;
  name: string;
  state?: string;
  summary: string;
  details: DetailField[];
  owned: boolean;
}

export interface SessionSnapshot {
  currentProviderId?: string;
  selectedProfileId?: string;
  selectedAuthMethod?: AuthMethod;
  selectedAzureResourceGroup?: string;
  selectedAzureVmId?: string;
  selectedS3BucketName?: string;
  selectedS3ObjectKey?: string;
  s3PrefixFilter?: string;
  selectedEc2Region?: string;
  selectedEc2InstanceId?: string;
  selectedLambdaRegion?: string;
  selectedLambdaFunctionName?: string;
  selectedDynamodbRegion?: string;
  selectedDynamodbTableName?: string;
  selectedSqsRegion?: string;
  selectedSqsQueueUrl?: string;
  selectedSnsRegion?: string;
  selectedSnsTopicArn?: string;
  selectedRdsRegion?: string;
  selectedRdsInstanceId?: string;
  selectedLogsRegion?: string;
  selectedLogGroupName?: string;
  selectedIamRoleName?: string;
  awsWriteModeEnabled?: boolean;
  azureWriteModeEnabled?: boolean;
  selectedAzureStorageAccount?: string;
  selectedAzureBlobContainer?: string;
  selectedAzureBlobName?: string;
  azureBlobPrefixFilter?: string;
  selectedAzureWebAppName?: string;
  selectedAzureWebAppSlot?: string;
  selectedAzureLogWorkspace?: string;
  selectedAzureWafPolicy?: string;
  selectedAzureFunctionApp?: string;
  selectedAzureFunction?: string;
  selectedAzureKeyVault?: string;
  selectedAzureSecret?: string;
  selectedAzureCosmosAccount?: string;
  selectedAzureCosmosDatabase?: string;
  selectedAzureCosmosContainer?: string;
  selectedAzurePostgresServer?: string;
  selectedAzureFrontDoorProfile?: string;
  selectedAzureFrontDoorEndpoint?: string;
  selectedAzureFrontDoorOriginGroup?: string;
  selectedAzureQueue?: string;
  lockedProviderId?: string;
  lockedProfileId?: string;
  lockedAuthMethod?: AuthMethod;
  isLocked: boolean;
  availableAuthMethods: AuthMethodStatus[];
  workspaceTabs: WorkspaceTab[];
}

export interface AwsS3Bucket {
  name: string;
  createdAt?: string;
  summary?: string;
}

export interface AwsS3Object {
  key: string;
  size?: string;
  modifiedAt?: string;
  storageClass?: string;
}

export interface AwsS3ExportSnippet {
  label: string;
  value: string;
}

export interface AwsS3UploadResult {
  bucketName: string;
  objectKey: string;
  destinationUri: string;
}

export interface AwsS3PresignResult {
  bucketName: string;
  objectKey: string;
  url: string;
  durationSeconds: number;
  expiresAt: string;
  effectiveWarning?: string;
}

export interface UrlInspection {
  summary: string;
  detailFields: DetailField[];
}

export interface UrlValidationResult {
  url: string;
  succeeded: boolean;
  summary: string;
  detailFields: DetailField[];
}

export interface AwsEc2Instance {
  instanceId: string;
  name?: string;
  state?: string;
  instanceType?: string;
  availabilityZone?: string;
  publicIp?: string;
  privateIp?: string;
  vpcId?: string;
  subnetId?: string;
  keyName?: string;
  platformDetails?: string;
  architecture?: string;
  launchTime?: string;
  securityGroups?: string[];
  tags?: DetailField[];
}

export interface AwsLambdaFunction {
  functionName: string;
  runtime?: string;
  memorySize?: number;
  lastModified?: string;
  description?: string;
  state?: string;
  codeSize?: number;
  handler?: string;
  timeout?: number;
  logGroup?: string;
  recentLogs?: string[];
}

export interface AwsLambdaInvokeResult {
  statusCode: number;
  executedVersion?: string;
  functionError?: string;
  logResult?: string;
  payload?: string;
  error?: string;
}

export interface AwsLambdaCreateInput {
  functionName: string;
  runtime: string;
  handler?: string;
  memorySize?: number;
  timeout?: number;
  description?: string;
  handlerSource?: string;
  zipSourcePath?: string;
}

export type LambdaCreateCodeSource = "starter" | "inline" | "zip";

export interface AwsDynamoDBGlobalSecondaryIndex {
  indexName: string;
  hashKey?: string;
  rangeKey?: string;
  status?: string;
}

export interface AwsDynamoDBTable {
  tableName: string;
  status?: string;
  itemCount?: number;
  tableSizeBytes?: number;
  billingMode?: string;
  hashKey?: string;
  rangeKey?: string;
  globalSecondaryIndexes?: AwsDynamoDBGlobalSecondaryIndex[];
  sampleItems?: string[];
}

export interface AwsSqsQueue {
  queueName: string;
  queueUrl: string;
  approximateNumberOfMessages?: number;
  approximateNumberOfMessagesNotVisible?: number;
  approximateNumberOfMessagesDelayed?: number;
  visibilityTimeout?: number;
  createdTimestamp?: number;
  queueArn?: string;
  delaySeconds?: number;
  receiveMessageWaitTimeSeconds?: number;
}

export interface AwsSqsMessage {
  messageId: string;
  body: string;
  receiptHandle?: string;
  sentTimestamp?: number;
  approximateReceiveCount?: number;
}

export interface AwsSqsPeekResult {
  queueUrl: string;
  messages: AwsSqsMessage[];
  summary: string;
}

export interface AwsSqsSendResult {
  queueUrl: string;
  messageId: string;
  summary: string;
}

export interface AwsSqsCreateQueueResult {
  queueName: string;
  queueUrl: string;
}

export interface AwsSnsPublishResult {
  topicArn: string;
  messageId: string;
  summary: string;
}

export interface AwsSnsCreateTopicResult {
  topicName: string;
  topicArn: string;
}

export interface AwsDynamoDBWriteResult {
  tableName: string;
  summary: string;
}

export interface AwsSnsSubscription {
  subscriptionArn: string;
  protocol?: string;
  endpoint?: string;
  owner?: string;
}

export interface AwsSnsTopic {
  topicArn: string;
  topicName: string;
  displayName?: string;
  owner?: string;
  subscriptionsConfirmed?: string;
  subscriptionsPending?: string;
  subscriptions?: AwsSnsSubscription[];
}

export interface AwsRdsInstance {
  dbInstanceIdentifier: string;
  engine?: string;
  engineVersion?: string;
  status?: string;
  instanceClass?: string;
  endpoint?: string;
  endpointAddress?: string;
  endpointPort?: number;
  availabilityZone?: string;
  allocatedStorage?: number;
  multiAz?: boolean;
  storageEncrypted?: boolean;
}

export interface AwsLogGroup {
  logGroupName: string;
  arn?: string;
  storedBytes?: number;
  retentionInDays?: number;
  creationTime?: number;
  recentEvents?: string[];
}

export interface AwsIamRole {
  roleName: string;
  roleArn?: string;
  path?: string;
  description?: string;
  createDate?: string;
  attachedPolicies?: string[];
}

export interface AwsIamPolicy {
  policyName: string;
  policyArn?: string;
  attachmentCount?: number;
  updateDate?: string;
}

export interface AzureResourceGroup {
  name: string;
  location?: string;
  provisioningState?: string;
  managedBy?: string;
  tags?: DetailField[];
}

export interface AzureVirtualMachine {
  vmId: string;
  name: string;
  resourceGroup?: string;
  location?: string;
  powerState?: string;
  provisioningState?: string;
  size?: string;
  osType?: string;
  privateIp?: string;
  publicIp?: string;
  tags?: DetailField[];
}

export interface AzureBastionHost {
  name: string;
  resourceGroup: string;
  location?: string;
  sku?: string;
}

export interface AzureBastionConnectResult {
  command: string;
  powershellCommand?: string;
  launched: boolean;
  protocol?: string;
}

export interface AzureStorageAccount {
  name: string;
  kind?: string;
  location?: string;
  blobEndpoint?: string;
  summary?: string;
}

export interface AzureBlobContainer {
  name: string;
  lastModified?: string;
}

export interface AzureBlob {
  name: string;
  size?: string;
  modifiedAt?: string;
  contentType?: string;
}

export interface AzureBlobUploadResult {
  accountName: string;
  containerName: string;
  blobName: string;
  blobUrl: string;
}

export interface AzureWebApp {
  name: string;
  resourceGroup?: string;
  location?: string;
  state?: string;
  defaultHostName?: string;
  kind?: string;
  httpsOnly?: boolean;
  appServicePlan?: string;
  planSku?: string;
  runtime?: string;
  outboundIpAddresses?: string;
  identityType?: string;
  identityPrincipalId?: string;
}

export interface AzureAppServicePlan {
  name: string;
  resourceGroup?: string;
  location?: string;
  sku?: string;
  kind?: string;
  status?: string;
  numberOfWorkers?: number;
}

export interface AzureWebAppSetting {
  name: string;
  value: string;
  slotSetting?: boolean;
}

export interface AzureWebAppDeploymentSlot {
  name: string;
  status?: string;
  defaultHostName?: string;
  trafficPercent?: number;
}

export type AzureWebAppAction = "start" | "stop" | "restart";

export interface AzureLogAnalyticsWorkspace {
  name: string;
  resourceGroup?: string;
  location?: string;
  customerId?: string;
}

export interface AzureLogQueryResult {
  columns: string[];
  rows: string[][];
  durationMs?: number;
  truncated?: boolean;
}

export interface AzureLogAnalyticsSelectionResult {
  workspace: string;
}

export interface AzureLogAnalyticsHistoryEntry {
  query: string;
  timespan?: string;
  ranAt: string;
}

export interface AzureLogAnalyticsSavedQuery {
  id: string;
  name: string;
  query: string;
  timespan?: string;
}

export interface AzureLogAnalyticsTableInfo {
  name: string;
  columns?: string[];
}

export interface AzureWafLogColumnMap {
  timeGenerated: string;
  category?: string;
  action: string;
  ruleName: string;
  requestUri: string;
  clientIP: string;
  host: string;
  policyName: string;
  policyMode: string;
  trackingReference: string;
  detailsMatches?: string;
  detailsMessage?: string;
  detailsData?: string;
  additionalFields?: string;
}

export interface AzureWafLogSchemaProfile {
  mode: "azureDiagnostics" | "resourceSpecific" | "applicationGateway" | string;
  tableName: string;
  categories?: string[];
  columns: AzureWafLogColumnMap;
  detected: boolean;
  message?: string;
}

export interface AzureWafPolicySummary {
  name: string;
  resourceGroup: string;
  location?: string;
  sku?: string;
  mode?: string;
  enabled: boolean;
}

export interface AzureWafManagedRuleGroup {
  ruleSetType: string;
  ruleSetVersion: string;
  ruleSetAction?: string;
  ruleGroupName?: string;
}

export interface AzureWafManagedRuleOverride {
  ruleId: string;
  ruleGroupName?: string;
  enabled: boolean;
  action?: string;
}

export interface AzureWafExclusion {
  ruleSetType?: string;
  matchVariable: string;
  selectorMatchOperator: string;
  selector?: string;
}

export interface AzureWafCustomRule {
  name: string;
  priority: number;
  ruleType: string;
  action: string;
  enabled: boolean;
}

export interface AzureWafPolicyDetail {
  name: string;
  resourceGroup: string;
  location?: string;
  sku?: string;
  mode: string;
  enabled: boolean;
  requestBodyCheck?: string;
  managedRuleSets: AzureWafManagedRuleGroup[];
  managedRuleOverrides: AzureWafManagedRuleOverride[];
  exclusions: AzureWafExclusion[];
  customRules: AzureWafCustomRule[];
  redirectUrl?: string;
  customBlockStatusCode?: number;
}

export interface AzureWafRuleFireCount {
  ruleName: string;
  count: number;
  action?: string;
}

export interface AzureFrontDoorProfile {
  name: string;
  resourceGroup?: string;
  location?: string;
  sku?: string;
  wafPolicyName?: string;
  wafPolicyResourceGroup?: string;
}

export interface AzureFrontDoorEndpoint {
  name: string;
  profileName?: string;
  resourceGroup?: string;
  hostName?: string;
  enabledState?: string;
}

export interface AzureFrontDoorOriginGroup {
  name: string;
  profileName?: string;
  resourceGroup?: string;
  healthProbe?: string;
  loadBalancing?: string;
}

export interface AzureFrontDoorOrigin {
  name: string;
  originGroupName?: string;
  profileName?: string;
  resourceGroup?: string;
  hostName?: string;
  enabledState?: string;
  priority?: number;
  weight?: number;
}

export interface AzureFunctionApp {
  name: string;
  resourceGroup?: string;
  location?: string;
  state?: string;
  defaultHostName?: string;
  runtime?: string;
}

export interface AzureFunction {
  name: string;
  trigger?: string;
  language?: string;
}

export interface AzureFunctionInvokeResult {
  statusCode: number;
  body: string;
}

export interface AzureKeyVault {
  name: string;
  resourceGroup?: string;
  location?: string;
  vaultUri?: string;
}

export interface AzureKeyVaultSecret {
  name: string;
  enabled: boolean;
  updated?: string;
}

export interface AzureCosmosAccount {
  name: string;
  resourceGroup?: string;
  documentEndpoint?: string;
}

export interface AzureCosmosDatabase {
  name: string;
}

export interface AzureCosmosContainer {
  name: string;
  partitionKey?: string;
}

export interface AzureCosmosItem {
  id: string;
  json: string;
}

export interface AzurePostgresServer {
  name: string;
  resourceGroup?: string;
  location: string;
  version: string;
  administratorLogin: string;
  sku: string;
  storageMb: number;
  provisioningState: string;
  fqdn: string;
  localHost?: string;
  localPort?: number;
  tags?: DetailField[];
}

export interface AzurePostgresConnection {
  host: string;
  port: number;
  jdbcUrl: string;
  uri: string;
  psql: string;
  dotNet: string;
  note?: string;
}

export interface AzureStorageQueue {
  name: string;
}

export interface AzureQueueMessage {
  id: string;
  text: string;
  dequeueCount: number;
  insertionTime?: string;
}

export interface AzureEntraUser {
  displayName: string;
  userPrincipalName?: string;
  id?: string;
}

export interface AzureEntraGroup {
  displayName: string;
  id?: string;
}

export interface AzureEntraApp {
  displayName: string;
  appId?: string;
}

export interface AzureCLIExtensionStatus {
  name: string;
  summary: string;
  installed: boolean;
  installCommand: string;
}

export interface WorkspaceSnapshot {
  provider?: ProviderSummary;
  profile?: ProfileSummary;
  authMethod?: AuthMethod;
  runtimeSettings: AppSettingsSnapshot;
  environmentDiagnostics?: DetailField[];
  dockerDiagnostics: DockerDiagnostics;
  dockerRuntime: DockerRuntimeSnapshot;
  dockerResources: ManagedDockerResource[];
  emulatorSummaries: EmulatorSummary[];
  localConfigArtifacts: LocalConfigArtifact[];
  awsEndpointUrl?: string;
  awsWriteCapable: boolean;
  awsWriteModeEnabled: boolean;
  awsWritesEnabled: boolean;
  azureEndpointUrl?: string;
  azureCliExtensions?: AzureCLIExtensionStatus[];
  azureWriteCapable: boolean;
  azureWriteModeEnabled: boolean;
  azureWritesEnabled: boolean;
  selectedAzureResourceGroup?: string;
  selectedAzureVmId?: string;
  selectedAzureStorageAccount?: string;
  selectedAzureBlobContainer?: string;
  selectedAzureBlobName?: string;
  azureBlobPrefixFilter?: string;
  selectedAzureWebAppName?: string;
  selectedAzureWebAppSlot?: string;
  selectedAzureLogWorkspace?: string;
  selectedAzureWafPolicy?: string;
  selectedAzureFunctionApp?: string;
  selectedAzureFunction?: string;
  selectedAzureKeyVault?: string;
  selectedAzureSecret?: string;
  selectedAzureCosmosAccount?: string;
  selectedAzureCosmosDatabase?: string;
  selectedAzureCosmosContainer?: string;
  selectedAzurePostgresServer?: string;
  selectedAzureFrontDoorProfile?: string;
  selectedAzureFrontDoorEndpoint?: string;
  selectedAzureFrontDoorOriginGroup?: string;
  selectedAzureQueue?: string;
  azureStatusMessage?: string;
  azureStorageStatusMessage?: string;
  azureAppServiceStatusMessage?: string;
  azureLogAnalyticsStatusMessage?: string;
  azureFunctionsStatusMessage?: string;
  azureKeyVaultStatusMessage?: string;
  azureCosmosStatusMessage?: string;
  azurePostgresStatusMessage?: string;
  azureFrontDoorStatusMessage?: string;
  azureQueuesStatusMessage?: string;
  azureEntraStatusMessage?: string;
  azureResourceGroups: AzureResourceGroup[];
  azureVirtualMachines: AzureVirtualMachine[];
  azureStorageAccounts: AzureStorageAccount[];
  azureBlobContainers: AzureBlobContainer[];
  azureBlobs: AzureBlob[];
  azureBlobMetadata: DetailField[];
  azureWebApps: AzureWebApp[];
  azureWebAppActiveDetail?: AzureWebApp;
  azureAppServicePlans: AzureAppServicePlan[];
  azureWebAppSettings: AzureWebAppSetting[];
  azureWebAppDeploymentSlots: AzureWebAppDeploymentSlot[];
  azureLogAnalyticsWorkspaces: AzureLogAnalyticsWorkspace[];
  azureWafLogSchema?: AzureWafLogSchemaProfile;
  azureWafStatusMessage?: string;
  azureWafPolicies: AzureWafPolicySummary[];
  azureWafPolicyDetail?: AzureWafPolicyDetail;
  azureWafRuleFireCounts: AzureWafRuleFireCount[];
  azureFunctionApps: AzureFunctionApp[];
  azureFunctions: AzureFunction[];
  azureKeyVaults: AzureKeyVault[];
  azureKeyVaultSecrets: AzureKeyVaultSecret[];
  azureCosmosAccounts: AzureCosmosAccount[];
  azureCosmosDatabases: AzureCosmosDatabase[];
  azureCosmosContainers: AzureCosmosContainer[];
  azureCosmosItems: AzureCosmosItem[];
  azurePostgresServers: AzurePostgresServer[];
  azurePostgresConnection?: AzurePostgresConnection;
  azureFrontDoorProfiles: AzureFrontDoorProfile[];
  azureFrontDoorEndpoints: AzureFrontDoorEndpoint[];
  azureFrontDoorOriginGroups: AzureFrontDoorOriginGroup[];
  azureFrontDoorOrigins: AzureFrontDoorOrigin[];
  azureStorageQueues: AzureStorageQueue[];
  azureQueueMessages: AzureQueueMessage[];
  azureEntraUsers: AzureEntraUser[];
  azureEntraGroups: AzureEntraGroup[];
  azureEntraApps: AzureEntraApp[];
  selectedS3BucketName?: string;
  selectedS3ObjectKey?: string;
  s3PrefixFilter?: string;
  s3StatusMessage?: string;
  s3Buckets: AwsS3Bucket[];
  s3Objects: AwsS3Object[];
  s3ObjectMetadata: DetailField[];
  s3ExportSnippets: AwsS3ExportSnippet[];
  selectedEc2Region?: string;
  selectedEc2InstanceId?: string;
  ec2StatusMessage?: string;
  ec2Regions: string[];
  ec2Instances: AwsEc2Instance[];
  selectedLambdaRegion?: string;
  selectedLambdaFunctionName?: string;
  lambdaStatusMessage?: string;
  lambdaRegions: string[];
  lambdaFunctions: AwsLambdaFunction[];
  selectedDynamodbRegion?: string;
  selectedDynamodbTableName?: string;
  selectedSqsRegion?: string;
  selectedSqsQueueUrl?: string;
  selectedSnsRegion?: string;
  selectedSnsTopicArn?: string;
  selectedRdsRegion?: string;
  selectedRdsInstanceId?: string;
  selectedLogsRegion?: string;
  selectedLogGroupName?: string;
  selectedIamRoleName?: string;
  dynamodbStatusMessage?: string;
  dynamodbRegions: string[];
  dynamodbTables: AwsDynamoDBTable[];
  sqsStatusMessage?: string;
  sqsRegions: string[];
  sqsQueues: AwsSqsQueue[];
  snsStatusMessage?: string;
  snsRegions: string[];
  snsTopics: AwsSnsTopic[];
  rdsStatusMessage?: string;
  rdsRegions: string[];
  rdsInstances: AwsRdsInstance[];
  logsStatusMessage?: string;
  logsRegions: string[];
  logGroups: AwsLogGroup[];
  iamStatusMessage?: string;
  iamRoles: AwsIamRole[];
  iamPolicies: AwsIamPolicy[];
}

export interface JobStatus {
  jobId: string;
  label: string;
  status: JobLifecycle;
  message: string;
  completedAt?: string;
  result?: unknown;
}

export interface ActivityLogEntry {
  id: number;
  level: LogLevel;
  message: string;
  timestamp: string;
  details?: string;
}

export interface AppSettingsSnapshot {
  platformName: string;
  configDir: string;
  databasePath: string;
  logPath: string;
  runtimeMode: RuntimeMode;
  localConfigDir: string;
  emulatorStateDir: string;
  localStackImage: string;
  flociAzImage: string;
}

export interface EmulatorLogSnapshot {
  emulatorId: string;
  lines: string[];
  summary: string;
}

export interface EmulatorActionResult {
  emulatorId: string;
  action: string;
  state: "succeeded" | "degraded" | "failed";
  summary: string;
  status: EmulatorSummary;
}

export interface StateChangedPayload {
  providers: ProviderSummary[];
  profiles: ProfileSummary[];
  session: SessionSnapshot;
}

export interface AppResetResult {
  summary: string;
  resetPaths: string[];
  skippedPaths: string[];
}

// --- IaC recipes & deployments ----------------------------------------------

export interface RecipeLocalRuntime {
  id: string;
  requiresPro?: boolean;
}

export interface RecipeImageBuild {
  dockerfileDirVar: string;
  imageVar: string;
  repositoryVar?: string;
}

export interface RecipeSuperpowers {
  iamPolicyStream?: boolean;
  chaos?: string[];
}

export interface RecipeManifest {
  apiVersion: string;
  id: string;
  version: string;
  name: string;
  summary?: string;
  description?: string;
  kind?: "app-deploy" | "service-lab" | string;
  providers?: string[];
  tags?: string[];
  engine: { type: string; minVersion?: string };
  local: {
    emulator?: string;
    requiresPro?: boolean;
    runtimes?: RecipeLocalRuntime[];
  };
  superpowers?: RecipeSuperpowers;
  imageBuild?: RecipeImageBuild;
}

export interface RecipeVisibleWhen {
  variable: string;
  equals: string;
}

export interface RecipeVariable {
  name: string;
  type: string;
  description?: string;
  default?: unknown;
  required: boolean;
  sensitive?: boolean;
  group: string;
  widget: string;
  options?: string[];
  help?: string;
  visibleWhen?: RecipeVisibleWhen;
}

export interface RecipeOutputSpec {
  name: string;
  description?: string;
  sensitive?: boolean;
  primary?: boolean;
}

export interface Recipe {
  manifest: RecipeManifest;
  variables: RecipeVariable[];
  outputs: RecipeOutputSpec[];
}

export interface ResourceChange {
  address: string;
  type: string;
  name: string;
  actions: string[];
}

export interface PlanSummary {
  add: number;
  change: number;
  destroy: number;
  changes: ResourceChange[];
}

export interface DeploymentOutput {
  name: string;
  value: unknown;
  sensitive?: boolean;
}

export type DeploymentStatus =
  | "pending"
  | "planning"
  | "planned"
  | "applying"
  | "applied"
  | "destroying"
  | "destroyed"
  | "failed"
  | "cancelled";

export interface Deployment {
  id: string;
  recipeId: string;
  name: string;
  providerId: string;
  profileId: string;
  local: boolean;
  runtimeId?: string;
  variables: Record<string, unknown>;
  status: DeploymentStatus;
  plan?: PlanSummary;
  outputs?: DeploymentOutput[];
  error?: string;
  postApplyError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentJob {
  deployment: Deployment;
  job: JobStatus;
}

export interface TofuStatus {
  available: boolean;
  version: string;
  path: string;
}

export interface DeploymentLogEvent {
  deploymentId: string;
  jobId: string;
  line: string;
}
