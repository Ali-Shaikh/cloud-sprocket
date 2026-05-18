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
  awsWritesEnabled: boolean;
  selectedAzureResourceGroup?: string;
  selectedAzureVmId?: string;
  azureStatusMessage?: string;
  azureResourceGroups: AzureResourceGroup[];
  azureVirtualMachines: AzureVirtualMachine[];
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
}

export interface StateChangedPayload {
  providers: ProviderSummary[];
  profiles: ProfileSummary[];
  session: SessionSnapshot;
}
