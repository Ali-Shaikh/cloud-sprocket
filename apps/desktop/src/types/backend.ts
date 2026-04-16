export type ProviderState = "configured" | "tooling-only" | "missing";
export type AuthMethod = "cli" | "sso" | "local-files";
export type JobLifecycle = "queued" | "running" | "completed" | "failed";
export type LogLevel = "info" | "success" | "warning" | "error";

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

export interface SessionSnapshot {
  currentProviderId?: string;
  selectedProfileId?: string;
  selectedAuthMethod?: AuthMethod;
  selectedS3BucketName?: string;
  selectedS3ObjectKey?: string;
  s3PrefixFilter?: string;
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

export interface AwsEc2Instance {
  instanceId: string;
  name?: string;
  state?: string;
  instanceType?: string;
  availabilityZone?: string;
  publicIp?: string;
  privateIp?: string;
}

export interface WorkspaceSnapshot {
  provider?: ProviderSummary;
  profile?: ProfileSummary;
  authMethod?: AuthMethod;
  runtimeSettings: AppSettingsSnapshot;
  selectedS3BucketName?: string;
  selectedS3ObjectKey?: string;
  s3PrefixFilter?: string;
  s3StatusMessage?: string;
  s3Buckets: AwsS3Bucket[];
  s3Objects: AwsS3Object[];
  s3ObjectMetadata: DetailField[];
  ec2Instances: AwsEc2Instance[];
}

export interface JobStatus {
  jobId: string;
  label: string;
  status: JobLifecycle;
  message: string;
  completedAt?: string;
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
}

export interface StateChangedPayload {
  providers: ProviderSummary[];
  profiles: ProfileSummary[];
  session: SessionSnapshot;
}
