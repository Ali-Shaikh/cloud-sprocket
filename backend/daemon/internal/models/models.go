package models

type ProviderState string

const (
	ProviderStateConfigured  ProviderState = "configured"
	ProviderStateToolingOnly ProviderState = "tooling-only"
	ProviderStateMissing     ProviderState = "missing"
)

type AuthMethod string

const (
	AuthMethodCLI        AuthMethod = "cli"
	AuthMethodSSO        AuthMethod = "sso"
	AuthMethodLocalFiles AuthMethod = "local-files"
)

type DetailField struct {
	Label     string `json:"label"`
	Value     string `json:"value"`
	Sensitive bool   `json:"sensitive,omitempty"`
}

type AuthMethodStatus struct {
	Method    AuthMethod `json:"method"`
	Label     string     `json:"label"`
	Summary   string     `json:"summary"`
	Available bool       `json:"available"`
}

type ProviderSummary struct {
	ProviderID   string        `json:"providerId"`
	Label        string        `json:"label"`
	State        ProviderState `json:"state"`
	Summary      string        `json:"summary"`
	ProfileCount int           `json:"profileCount"`
	CommandPath  string        `json:"commandPath,omitempty"`
	Locations    []string      `json:"locations"`
}

type ProfileSummary struct {
	ProviderID  string             `json:"providerId"`
	ProfileID   string             `json:"profileId"`
	DisplayName string             `json:"displayName"`
	Summary     string             `json:"summary"`
	SourcePaths []string           `json:"sourcePaths"`
	Attributes  []DetailField      `json:"attributes"`
	AuthMethods []AuthMethodStatus `json:"authMethods"`
}

type WorkspaceTab struct {
	TabID   string `json:"tabId"`
	Label   string `json:"label"`
	Summary string `json:"summary"`
	Detail  string `json:"detail"`
}

type SessionSnapshot struct {
	CurrentProviderID    string             `json:"currentProviderId,omitempty"`
	SelectedProfileID    string             `json:"selectedProfileId,omitempty"`
	SelectedAuthMethod   AuthMethod         `json:"selectedAuthMethod,omitempty"`
	SelectedS3BucketName string             `json:"selectedS3BucketName,omitempty"`
	LockedProviderID     string             `json:"lockedProviderId,omitempty"`
	LockedProfileID      string             `json:"lockedProfileId,omitempty"`
	LockedAuthMethod     AuthMethod         `json:"lockedAuthMethod,omitempty"`
	IsLocked             bool               `json:"isLocked"`
	AvailableAuthMethods []AuthMethodStatus `json:"availableAuthMethods"`
	WorkspaceTabs        []WorkspaceTab     `json:"workspaceTabs"`
}

type AwsS3Bucket struct {
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt,omitempty"`
	Summary   string `json:"summary,omitempty"`
}

type AwsS3Object struct {
	Key          string `json:"key"`
	Size         string `json:"size,omitempty"`
	ModifiedAt   string `json:"modifiedAt,omitempty"`
	StorageClass string `json:"storageClass,omitempty"`
}

type AwsEc2Instance struct {
	InstanceID       string `json:"instanceId"`
	Name             string `json:"name,omitempty"`
	State            string `json:"state,omitempty"`
	InstanceType     string `json:"instanceType,omitempty"`
	AvailabilityZone string `json:"availabilityZone,omitempty"`
	PublicIP         string `json:"publicIp,omitempty"`
	PrivateIP        string `json:"privateIp,omitempty"`
}

type WorkspaceSnapshot struct {
	Provider             *ProviderSummary    `json:"provider,omitempty"`
	Profile              *ProfileSummary     `json:"profile,omitempty"`
	AuthMethod           AuthMethod          `json:"authMethod,omitempty"`
	RuntimeSettings      AppSettingsSnapshot `json:"runtimeSettings"`
	SelectedS3BucketName string              `json:"selectedS3BucketName,omitempty"`
	S3StatusMessage      string              `json:"s3StatusMessage,omitempty"`
	S3Buckets            []AwsS3Bucket       `json:"s3Buckets"`
	S3Objects            []AwsS3Object       `json:"s3Objects"`
	EC2Instances         []AwsEc2Instance    `json:"ec2Instances"`
}

type ActivityLogEntry struct {
	ID        int64  `json:"id"`
	Level     string `json:"level"`
	Message   string `json:"message"`
	Timestamp string `json:"timestamp"`
	Details   string `json:"details,omitempty"`
}

type AppSettingsSnapshot struct {
	PlatformName string `json:"platformName"`
	ConfigDir    string `json:"configDir"`
	DatabasePath string `json:"databasePath"`
	LogPath      string `json:"logPath"`
}

type JobStatus struct {
	JobID       string `json:"jobId"`
	Label       string `json:"label"`
	Status      string `json:"status"`
	Message     string `json:"message"`
	CompletedAt string `json:"completedAt,omitempty"`
}

type StateChangedPayload struct {
	Providers []ProviderSummary `json:"providers"`
	Profiles  []ProfileSummary  `json:"profiles"`
	Session   SessionSnapshot   `json:"session"`
}
