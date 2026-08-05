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

export interface ActionCapability {
  actionId: string;
  label: string;
  enabled: boolean;
  reason?: string;
}

export interface WorkspaceTab {
  tabId: string;
  label: string;
  summary: string;
  detail: string;
  category?: "workspace" | "service" | "tool" | "coming_soon";
  /** Service domain for sidebar grouping (compute, storage, ...). Absent on shell tabs and tools. */
  domain?: string;
}

export interface ServicePreferences {
  disabledProviders: string[];
  disabledServices: Record<string, string[]>;
}

export interface ServiceCatalogEntry {
  providerId: string;
  serviceId: string;
  label: string;
  summary: string;
  detail: string;
  category: string;
  domain?: string;
  inventoryScope?: string;
  enabled: boolean;
}

export interface PreferencesSnapshot {
  preferences: ServicePreferences;
  catalogue: ServiceCatalogEntry[];
}

export interface HiddenResourceHit {
  providerId: string;
  serviceId: string;
  label: string;
  resourceCount: number;
}

export interface HiddenResourcesSnapshot {
  hits: HiddenResourceHit[];
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
  selectedGcpStorageBucket?: string;
  gcpStoragePrefixFilter?: string;
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
  selectedEcsRegion?: string;
  selectedEcsClusterArn?: string;
  selectedEcsServiceArn?: string;
  selectedEcsTaskArn?: string;
  selectedEksRegion?: string;
  selectedEksClusterName?: string;
  selectedCloudFormationRegion?: string;
  selectedCloudFormationStackName?: string;
  selectedEventBridgeRegion?: string;
  selectedEventBridgeBusName?: string;
  selectedRoute53HostedZoneId?: string;
  selectedElbRegion?: string;
  selectedElbLoadBalancerArn?: string;
  selectedKmsRegion?: string;
  selectedKmsKeyId?: string;
  selectedApiGatewayRegion?: string;
  selectedApiGatewayApiKey?: string;
  selectedSecretsManagerRegion?: string;
  selectedSecretsManagerName?: string;
  selectedLogsRegion?: string;
  selectedLogGroupName?: string;
  selectedIamRoleName?: string;
  awsWriteModeEnabled?: boolean;
  azureWriteModeEnabled?: boolean;
  gcpWriteModeEnabled?: boolean;
  selectedGcpComputeInstance?: string;
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

export interface GcpStorageBucket {
  name: string;
  location?: string;
  locationType?: string;
  storageClass?: string;
  createdAt?: string;
  summary?: string;
}

export interface GcpStorageObject {
  key: string;
  size?: string;
  updated?: string;
  contentType?: string;
  /** True for delimiter virtual folders (prefix rows). */
  isFolder?: boolean;
}

export interface GcpComputeInstance {
  name: string;
  zone?: string;
  machineType?: string;
  status?: string;
  internalIp?: string;
  externalIp?: string;
  createdAt?: string;
  summary?: string;
}

export interface GcpCloudFunction {
  name: string;
  region?: string;
  runtime?: string;
  status?: string;
  generation?: string;
  trigger?: string;
  url?: string;
  updatedAt?: string;
  summary?: string;
}

export interface GcpGkeCluster {
  name: string;
  location?: string;
  status?: string;
  masterVersion?: string;
  nodeCount?: number;
  endpoint?: string;
  mode?: string;
  createdAt?: string;
  summary?: string;
}

export interface AwsS3Object {
  key: string;
  size?: string;
  modifiedAt?: string;
  storageClass?: string;
  /** True for delimiter CommonPrefixes (virtual folders). */
  isFolder?: boolean;
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
  sampleItemsNextToken?: string;
  sampleItemsHasMore?: boolean;
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

export interface AwsEcsCluster {
  clusterArn: string;
  clusterName: string;
  status?: string;
  runningTasksCount?: number;
  pendingTasksCount?: number;
  activeServicesCount?: number;
  registeredContainerInstancesCount?: number;
}

export interface AwsEcsService {
  serviceArn: string;
  serviceName: string;
  status?: string;
  desiredCount?: number;
  runningCount?: number;
  pendingCount?: number;
  launchType?: string;
  taskDefinition?: string;
}

export interface AwsEcsContainer {
  name: string;
  image?: string;
  lastStatus?: string;
}

export interface AwsEcsTask {
  taskArn: string;
  taskDefinitionArn?: string;
  lastStatus?: string;
  desiredStatus?: string;
  launchType?: string;
  startedAt?: string;
  group?: string;
  containers?: AwsEcsContainer[];
}

export interface AwsEksCluster {
  clusterArn: string;
  clusterName: string;
  status?: string;
  version?: string;
  endpoint?: string;
  platformVersion?: string;
  roleArn?: string;
}

export interface AwsEksNodeGroup {
  nodeGroupArn: string;
  nodeGroupName: string;
  status?: string;
  instanceTypes?: string[];
  desiredSize?: number;
  minSize?: number;
  maxSize?: number;
  diskSize?: number;
  amiType?: string;
  capacityType?: string;
}

export interface AwsCloudFormationStack {
  stackId: string;
  stackName: string;
  stackStatus?: string;
  creationTime?: string;
  lastUpdatedTime?: string;
  description?: string;
}

export interface AwsCloudFormationStackEvent {
  eventId: string;
  timestamp?: string;
  logicalResourceId?: string;
  resourceStatus?: string;
  resourceType?: string;
  resourceStatusReason?: string;
}

export interface AwsEventBridgeBus {
  name: string;
  arn?: string;
}

export interface AwsEventBridgeRule {
  name: string;
  arn?: string;
  state?: string;
  description?: string;
  scheduleExpression?: string;
  eventPattern?: string;
}

export interface AwsRoute53HostedZone {
  hostedZoneId: string;
  name: string;
  recordCount?: number;
  privateZone?: boolean;
  comment?: string;
}

export interface AwsRoute53ResourceRecordSet {
  name: string;
  type?: string;
  setIdentifier?: string;
  ttl?: number;
  values?: string[];
  aliasTarget?: string;
}

export interface AwsElbLoadBalancer {
  loadBalancerArn: string;
  loadBalancerName: string;
  dnsName?: string;
  type?: string;
  scheme?: string;
  state?: string;
  vpcId?: string;
  createdTime?: string;
}

export interface AwsElbTargetGroup {
  targetGroupArn: string;
  targetGroupName: string;
  protocol?: string;
  port?: number;
  targetType?: string;
  vpcId?: string;
  healthCheckPath?: string;
}

export interface AwsKmsKey {
  keyId: string;
  arn?: string;
  description?: string;
  keyUsage?: string;
  keyState?: string;
  keySpec?: string;
  origin?: string;
  creationDate?: string;
  deletionDate?: string;
  multiRegion?: boolean;
  enabled?: boolean;
}

export interface AwsKmsAlias {
  aliasName: string;
  aliasArn?: string;
  targetKeyId?: string;
}

export interface AwsApiGatewayApi {
  apiKey: string;
  apiId: string;
  apiName: string;
  apiType: string;
  description?: string;
  endpoint?: string;
  protocol?: string;
}

export interface AwsApiGatewayStage {
  apiKey: string;
  stageName: string;
  invokeUrl?: string;
  deploymentId?: string;
  description?: string;
  autoDeploy?: boolean;
}

export interface AwsSecretsManagerSecret {
  arn: string;
  name: string;
  description?: string;
  lastChangedDate?: string;
  lastAccessedDate?: string;
  rotationEnabled?: boolean;
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

export interface AzureBlobPresignResult {
  accountName: string;
  containerName: string;
  blobName: string;
  url: string;
  durationSeconds: number;
  expiresAt: string;
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
  awsWriteTargetIsLocal?: boolean;
  awsWriteModeEnabled: boolean;
  awsWritesEnabled: boolean;
  actionCapabilities?: Record<string, ActionCapability[]>;
  azureEndpointUrl?: string;
  azureCliExtensions?: AzureCLIExtensionStatus[];
  azureWriteCapable: boolean;
  azureWriteModeEnabled: boolean;
  azureWritesEnabled: boolean;
  gcpWriteCapable?: boolean;
  gcpWriteModeEnabled?: boolean;
  gcpWritesEnabled?: boolean;
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
  selectedGcpStorageBucket?: string;
  gcpStoragePrefixFilter?: string;
  gcpStorageStatusMessage?: string;
  /** Present after GCP Storage enrichment; omit in fixtures/mocks. */
  gcpStorageBuckets?: GcpStorageBucket[];
  gcpStorageObjects?: GcpStorageObject[];
  gcpStorageObjectsNextToken?: string;
  gcpStorageObjectsHasMore?: boolean;
  selectedGcpComputeInstance?: string;
  gcpComputeStatusMessage?: string;
  /** Present after GCP Compute enrichment; omit in fixtures/mocks. */
  gcpComputeInstances?: GcpComputeInstance[];
  selectedGcpFunction?: string;
  gcpFunctionsStatusMessage?: string;
  /** Present after GCP Functions enrichment; omit in fixtures/mocks. */
  gcpFunctions?: GcpCloudFunction[];
  selectedGcpGkeCluster?: string;
  gcpGkeStatusMessage?: string;
  /** Present after GCP GKE enrichment; omit in fixtures/mocks. */
  gcpGkeClusters?: GcpGkeCluster[];
  selectedS3BucketName?: string;
  selectedS3ObjectKey?: string;
  s3PrefixFilter?: string;
  s3StatusMessage?: string;
  s3Buckets: AwsS3Bucket[];
  s3Objects: AwsS3Object[];
  s3ObjectsNextToken?: string;
  s3ObjectsHasMore?: boolean;
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
  selectedEcsRegion?: string;
  selectedEcsClusterArn?: string;
  selectedEcsServiceArn?: string;
  selectedEcsTaskArn?: string;
  selectedEksRegion?: string;
  selectedEksClusterName?: string;
  selectedApiGatewayRegion?: string;
  selectedApiGatewayApiKey?: string;
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
  ecsStatusMessage?: string;
  ecsRegions: string[];
  ecsClusters: AwsEcsCluster[];
  ecsServices: AwsEcsService[];
  ecsTasks: AwsEcsTask[];
  eksStatusMessage?: string;
  eksRegions: string[];
  eksClusters: AwsEksCluster[];
  eksNodeGroups: AwsEksNodeGroup[];
  selectedCloudFormationRegion?: string;
  selectedCloudFormationStackName?: string;
  cloudFormationStatusMessage?: string;
  cloudFormationRegions: string[];
  cloudFormationStacks: AwsCloudFormationStack[];
  cloudFormationStackEvents: AwsCloudFormationStackEvent[];
  selectedEventBridgeRegion?: string;
  selectedEventBridgeBusName?: string;
  eventBridgeStatusMessage?: string;
  eventBridgeRegions: string[];
  eventBridgeBuses: AwsEventBridgeBus[];
  eventBridgeRules: AwsEventBridgeRule[];
  selectedRoute53HostedZoneId?: string;
  route53StatusMessage?: string;
  route53HostedZones: AwsRoute53HostedZone[];
  route53ResourceRecordSets: AwsRoute53ResourceRecordSet[];
  selectedElbRegion?: string;
  selectedElbLoadBalancerArn?: string;
  selectedKmsRegion?: string;
  selectedKmsKeyId?: string;
  elbStatusMessage?: string;
  elbRegions: string[];
  elbLoadBalancers: AwsElbLoadBalancer[];
  elbTargetGroups: AwsElbTargetGroup[];
  kmsStatusMessage?: string;
  kmsRegions: string[];
  kmsKeys: AwsKmsKey[];
  kmsAliases: AwsKmsAlias[];
  apiGatewayStatusMessage?: string;
  apiGatewayRegions: string[];
  apiGatewayApis: AwsApiGatewayApi[];
  apiGatewayStages: AwsApiGatewayStage[];
  selectedSecretsManagerRegion?: string;
  selectedSecretsManagerName?: string;
  secretsManagerStatusMessage?: string;
  secretsManagerRegions: string[];
  secretsManagerSecrets: AwsSecretsManagerSecret[];
  logsStatusMessage?: string;
  logsRegions: string[];
  logGroups: AwsLogGroup[];
  iamStatusMessage?: string;
  iamRoles: AwsIamRole[];
  iamPolicies: AwsIamPolicy[];
}

/**
 * The AWS inventory RPC returns only the authoritative fields for its requested
 * scope. Required list fields deliberately stay required so an empty list can
 * clear stale inventory in the desktop store.
 */
export interface AwsInventoryPayloadByScope {
  s3: Pick<
    WorkspaceSnapshot,
    | "selectedS3BucketName"
    | "selectedS3ObjectKey"
    | "s3PrefixFilter"
    | "s3StatusMessage"
    | "s3Buckets"
    | "s3Objects"
    | "s3ObjectsNextToken"
    | "s3ObjectsHasMore"
    | "s3ObjectMetadata"
    | "s3ExportSnippets"
  >;
  ec2: Pick<
    WorkspaceSnapshot,
    | "selectedEc2Region"
    | "selectedEc2InstanceId"
    | "ec2StatusMessage"
    | "ec2Regions"
    | "ec2Instances"
  >;
  lambda: Pick<
    WorkspaceSnapshot,
    | "selectedLambdaRegion"
    | "selectedLambdaFunctionName"
    | "lambdaStatusMessage"
    | "lambdaRegions"
    | "lambdaFunctions"
  >;
  dynamodb: Pick<
    WorkspaceSnapshot,
    | "selectedDynamodbRegion"
    | "selectedDynamodbTableName"
    | "dynamodbStatusMessage"
    | "dynamodbRegions"
    | "dynamodbTables"
  >;
  sqs: Pick<
    WorkspaceSnapshot,
    | "selectedSqsRegion"
    | "selectedSqsQueueUrl"
    | "sqsStatusMessage"
    | "sqsRegions"
    | "sqsQueues"
  >;
  sns: Pick<
    WorkspaceSnapshot,
    | "selectedSnsRegion"
    | "selectedSnsTopicArn"
    | "snsStatusMessage"
    | "snsRegions"
    | "snsTopics"
  >;
  rds: Pick<
    WorkspaceSnapshot,
    | "selectedRdsRegion"
    | "selectedRdsInstanceId"
    | "rdsStatusMessage"
    | "rdsRegions"
    | "rdsInstances"
  >;
  ecs: Pick<
    WorkspaceSnapshot,
    | "selectedEcsRegion"
    | "selectedEcsClusterArn"
    | "selectedEcsServiceArn"
    | "selectedEcsTaskArn"
    | "ecsStatusMessage"
    | "ecsRegions"
    | "ecsClusters"
    | "ecsServices"
    | "ecsTasks"
  >;
  eks: Pick<
    WorkspaceSnapshot,
    | "selectedEksRegion"
    | "selectedEksClusterName"
    | "eksStatusMessage"
    | "eksRegions"
    | "eksClusters"
    | "eksNodeGroups"
  >;
  cloudformation: Pick<
    WorkspaceSnapshot,
    | "selectedCloudFormationRegion"
    | "selectedCloudFormationStackName"
    | "cloudFormationStatusMessage"
    | "cloudFormationRegions"
    | "cloudFormationStacks"
    | "cloudFormationStackEvents"
  >;
  eventbridge: Pick<
    WorkspaceSnapshot,
    | "selectedEventBridgeRegion"
    | "selectedEventBridgeBusName"
    | "eventBridgeStatusMessage"
    | "eventBridgeRegions"
    | "eventBridgeBuses"
    | "eventBridgeRules"
  >;
  route53: Pick<
    WorkspaceSnapshot,
    | "selectedRoute53HostedZoneId"
    | "route53StatusMessage"
    | "route53HostedZones"
    | "route53ResourceRecordSets"
  >;
  elb: Pick<
    WorkspaceSnapshot,
    | "selectedElbRegion"
    | "selectedElbLoadBalancerArn"
    | "elbStatusMessage"
    | "elbRegions"
    | "elbLoadBalancers"
    | "elbTargetGroups"
  >;
  kms: Pick<
    WorkspaceSnapshot,
    | "selectedKmsRegion"
    | "selectedKmsKeyId"
    | "kmsStatusMessage"
    | "kmsRegions"
    | "kmsKeys"
    | "kmsAliases"
  >;
  apigateway: Pick<
    WorkspaceSnapshot,
    | "selectedApiGatewayRegion"
    | "selectedApiGatewayApiKey"
    | "apiGatewayStatusMessage"
    | "apiGatewayRegions"
    | "apiGatewayApis"
    | "apiGatewayStages"
  >;
  secrets: Pick<
    WorkspaceSnapshot,
    | "selectedSecretsManagerRegion"
    | "selectedSecretsManagerName"
    | "secretsManagerStatusMessage"
    | "secretsManagerRegions"
    | "secretsManagerSecrets"
  >;
  logs: Pick<
    WorkspaceSnapshot,
    | "selectedLogsRegion"
    | "selectedLogGroupName"
    | "logsStatusMessage"
    | "logsRegions"
    | "logGroups"
  >;
  iam: Pick<
    WorkspaceSnapshot,
    "selectedIamRoleName" | "iamStatusMessage" | "iamRoles" | "iamPolicies"
  >;
}

export type AwsInventoryScope = keyof AwsInventoryPayloadByScope;

/** Correlates each AWS inventory scope with only that scope's payload fields. */
export type AwsInventorySlice<S extends AwsInventoryScope = AwsInventoryScope> = {
  [K in S]: {
    providerId: "aws";
    scope: K;
    payload: AwsInventoryPayloadByScope[K];
  };
}[S];

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
  lab?: LabSpec;
  /** Set by the daemon: bundled catalogue vs trusted local import. */
  source?: "bundled" | "imported";
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

export type PolicySeverity = "warning" | "deny";
export type PolicyStatus = "passed" | "warned" | "blocked";

export interface PolicyFinding {
  ruleId: string;
  title: string;
  message: string;
  severity: PolicySeverity;
  resourceAddress?: string;
}

export interface PolicyOverride {
  decisionDigest: string;
  confirmedAt: string;
  findingKeys: string[];
}

export interface PolicyEvaluation {
  status: PolicyStatus;
  planDigest: string;
  decisionDigest: string;
  evaluatedAt: string;
  blockingCount: number;
  findings: PolicyFinding[];
  override?: PolicyOverride;
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
  policy?: PolicyEvaluation;
  outputs?: DeploymentOutput[];
  error?: string;
  postApplyError?: string;
  drift?: DriftReport;
  recipeVersion?: string;
  revisions?: DeploymentRevision[];
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentRevision {
  at: string;
  recipeVersion?: string;
  variables: Record<string, unknown>;
  plan?: PlanSummary;
  policy?: PolicyEvaluation;
}

export interface DriftReport {
  hasDrift: boolean;
  drift?: PlanSummary; // re-uses the plan summary shape for the list of drifted resources
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

// --- Guided labs -------------------------------------------------------------

export type LabDifficulty = "beginner" | "intermediate" | "advanced";

export type LabStepStatus = "pending" | "in_progress" | "passed" | "failed" | "skipped";

export type LabSessionStatus = "not_started" | "in_progress" | "completed" | "abandoned";

export interface LabActionOpenTab {
  type: "open-tab";
  tab: string;
  focus?: string;
}

export interface LabActionInvokeWrite {
  type: "invoke-write";
  op: string;
  params?: Record<string, unknown>;
}

export type LabStepAction = LabActionOpenTab | LabActionInvokeWrite | { type: string; [key: string]: unknown };

export interface LabVerifyCheck {
  type: string;
  [key: string]: unknown;
}

export interface LabFaultSpec {
  kind: string;
  target?: string;
  params?: Record<string, string>;
}

export interface LabFaultState {
  kind: string;
  target?: string;
  available: boolean;
  reason?: string;
}

export interface LabStepSpec {
  id: string;
  title: string;
  body: string;
  fault?: LabFaultSpec;
  actions?: LabStepAction[];
  verify?: LabVerifyCheck[];
  hints?: string[];
}

export interface LabSpec {
  difficulty: LabDifficulty;
  estimatedMinutes: number;
  objectives: string[];
  steps: LabStepSpec[];
}

export interface LabVerifyResult {
  type: string;
  passed: boolean;
  detail: string;
  /** Optional human-readable note (e.g. check runtime error text). */
  message?: string;
}

export interface LabStepSession {
  stepId: string;
  status: LabStepStatus;
  startedAt?: string;
  completedAt?: string;
  verifyResults: LabVerifyResult[];
  fault?: LabFaultState;
}

export interface LabActiveFault {
  kind: string;
  target: string;
  params?: Record<string, string>;
  runtimeId: string;
  startedAt: string;
}

export interface LabSession {
  deploymentId: string;
  recipeId: string;
  status: LabSessionStatus;
  startedAt: string;
  completedAt?: string;
  updatedAt?: string;
  currentStepId?: string;
  steps: LabStepSession[];
  activeFault?: LabActiveFault;
}

export interface LabRunActionResult {
  session: LabSession;
  action?: LabStepAction;
}
