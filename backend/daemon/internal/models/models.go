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

type RuntimeMode string

const (
	RuntimeModeCloud         RuntimeMode = "cloud"
	RuntimeModeLocalEmulator RuntimeMode = "local-emulator"
)

type DockerEngineState string

const (
	DockerEngineStateUnknown     DockerEngineState = "unknown"
	DockerEngineStateUnavailable DockerEngineState = "unavailable"
	DockerEngineStateAvailable   DockerEngineState = "available"
)

type EmulatorStatus string

const (
	EmulatorStatusUnknown       EmulatorStatus = "unknown"
	EmulatorStatusNotConfigured EmulatorStatus = "not-configured"
	EmulatorStatusStopped       EmulatorStatus = "stopped"
	EmulatorStatusRunning       EmulatorStatus = "running"
	EmulatorStatusUnhealthy     EmulatorStatus = "unhealthy"
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

type DockerDiagnostics struct {
	EngineState DockerEngineState `json:"engineState"`
	Summary     string            `json:"summary"`
	ContextName string            `json:"contextName,omitempty"`
	Host        string            `json:"host,omitempty"`
	Details     []DetailField     `json:"details"`
}

type EmulatorSummary struct {
	EmulatorID string         `json:"emulatorId"`
	ProviderID string         `json:"providerId"`
	Label      string         `json:"label"`
	Kind       string         `json:"kind"`
	Status     EmulatorStatus `json:"status"`
	Summary    string         `json:"summary"`
	Details    []DetailField  `json:"details"`
}

type LocalConfigArtifact struct {
	ArtifactID string `json:"artifactId"`
	ProviderID string `json:"providerId"`
	Label      string `json:"label"`
	Path       string `json:"path"`
	Status     string `json:"status"`
	Managed    bool   `json:"managed"`
	Summary    string `json:"summary"`
}

type LocalStackStatus struct {
	EmulatorID  string         `json:"emulatorId"`
	ProviderID  string         `json:"providerId"`
	Label       string         `json:"label"`
	Kind        string         `json:"kind"`
	Status      EmulatorStatus `json:"status"`
	Summary     string         `json:"summary"`
	ContainerID string         `json:"containerId,omitempty"`
	Image       string         `json:"image,omitempty"`
	Port        string         `json:"port,omitempty"`
	Endpoint    string         `json:"endpoint,omitempty"`
	ProfileName string         `json:"profileName,omitempty"`
	ConfigPath  string         `json:"configPath,omitempty"`
	CredsPath   string         `json:"credsPath,omitempty"`
	Details     []DetailField  `json:"details"`
}

type LocalStackStartOptions struct {
	EmulatorID  string            `json:"emulatorId,omitempty"`
	AuthToken   string            `json:"authToken,omitempty"`
	Persistence bool              `json:"persistence,omitempty"`
	Environment map[string]string `json:"environment,omitempty"`
}

type EmulatorLogSnapshot struct {
	EmulatorID string   `json:"emulatorId"`
	Lines      []string `json:"lines"`
	Summary    string   `json:"summary"`
}

type EmulatorActionState string

const (
	EmulatorActionSucceeded EmulatorActionState = "succeeded"
	EmulatorActionDegraded  EmulatorActionState = "degraded"
	EmulatorActionFailed    EmulatorActionState = "failed"
)

type EmulatorActionResult struct {
	EmulatorID string              `json:"emulatorId"`
	Action     string              `json:"action"`
	State      EmulatorActionState `json:"state"`
	Summary    string              `json:"summary"`
	Status     LocalStackStatus    `json:"status"`
}

type DockerOwnershipPolicy struct {
	LabelKey        string `json:"labelKey"`
	LabelValue      string `json:"labelValue"`
	ProjectLabelKey string `json:"projectLabelKey"`
	ProjectName     string `json:"projectName"`
	Summary         string `json:"summary"`
}

type DockerRuntimeSnapshot struct {
	Reachable         bool                  `json:"reachable"`
	Host              string                `json:"host,omitempty"`
	HostSource        string                `json:"hostSource,omitempty"`
	ContextName       string                `json:"contextName,omitempty"`
	ServerVersion     string                `json:"serverVersion,omitempty"`
	APIVersion        string                `json:"apiVersion,omitempty"`
	OperatingSystem   string                `json:"operatingSystem,omitempty"`
	Architecture      string                `json:"architecture,omitempty"`
	EngineName        string                `json:"engineName,omitempty"`
	ResourceOwnership DockerOwnershipPolicy `json:"resourceOwnership"`
	Summary           string                `json:"summary"`
	Details           []DetailField         `json:"details"`
}

type ManagedDockerResource struct {
	ResourceID string        `json:"resourceId"`
	Kind       string        `json:"kind"`
	Name       string        `json:"name"`
	State      string        `json:"state,omitempty"`
	Summary    string        `json:"summary"`
	Details    []DetailField `json:"details"`
	Owned      bool          `json:"owned"`
}

type SessionSnapshot struct {
	CurrentProviderID          string             `json:"currentProviderId,omitempty"`
	SelectedProfileID          string             `json:"selectedProfileId,omitempty"`
	SelectedAuthMethod         AuthMethod         `json:"selectedAuthMethod,omitempty"`
	SelectedAzureResourceGroup string             `json:"selectedAzureResourceGroup,omitempty"`
	SelectedAzureVMID          string             `json:"selectedAzureVmId,omitempty"`
	SelectedS3BucketName       string             `json:"selectedS3BucketName,omitempty"`
	SelectedS3ObjectKey        string             `json:"selectedS3ObjectKey,omitempty"`
	S3PrefixFilter             string             `json:"s3PrefixFilter,omitempty"`
	SelectedEC2Region          string             `json:"selectedEc2Region,omitempty"`
	SelectedEC2InstanceID      string             `json:"selectedEc2InstanceId,omitempty"`
	SelectedLambdaRegion       string             `json:"selectedLambdaRegion,omitempty"`
	SelectedLambdaFunctionName string             `json:"selectedLambdaFunctionName,omitempty"`
	SelectedDynamoDBRegion     string             `json:"selectedDynamodbRegion,omitempty"`
	SelectedDynamoDBTableName  string             `json:"selectedDynamodbTableName,omitempty"`
	LockedProviderID           string             `json:"lockedProviderId,omitempty"`
	LockedProfileID            string             `json:"lockedProfileId,omitempty"`
	LockedAuthMethod           AuthMethod         `json:"lockedAuthMethod,omitempty"`
	IsLocked                   bool               `json:"isLocked"`
	AvailableAuthMethods       []AuthMethodStatus `json:"availableAuthMethods"`
	WorkspaceTabs              []WorkspaceTab     `json:"workspaceTabs"`
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

type AwsS3ExportSnippet struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

type AwsS3UploadResult struct {
	BucketName     string `json:"bucketName"`
	ObjectKey      string `json:"objectKey"`
	DestinationURI string `json:"destinationUri"`
}

type AwsS3PresignResult struct {
	BucketName       string `json:"bucketName"`
	ObjectKey        string `json:"objectKey"`
	URL              string `json:"url"`
	DurationSeconds  int    `json:"durationSeconds"`
	ExpiresAt        string `json:"expiresAt"`
	EffectiveWarning string `json:"effectiveWarning,omitempty"`
}

type URLInspection struct {
	Summary      string        `json:"summary"`
	DetailFields []DetailField `json:"detailFields"`
}

type URLValidationResult struct {
	URL          string        `json:"url"`
	Succeeded    bool          `json:"succeeded"`
	Summary      string        `json:"summary"`
	DetailFields []DetailField `json:"detailFields"`
}

type AwsEc2Instance struct {
	InstanceID       string        `json:"instanceId"`
	Name             string        `json:"name,omitempty"`
	State            string        `json:"state,omitempty"`
	InstanceType     string        `json:"instanceType,omitempty"`
	AvailabilityZone string        `json:"availabilityZone,omitempty"`
	PublicIP         string        `json:"publicIp,omitempty"`
	PrivateIP        string        `json:"privateIp,omitempty"`
	VpcID            string        `json:"vpcId,omitempty"`
	SubnetID         string        `json:"subnetId,omitempty"`
	KeyName          string        `json:"keyName,omitempty"`
	PlatformDetails  string        `json:"platformDetails,omitempty"`
	Architecture     string        `json:"architecture,omitempty"`
	LaunchTime       string        `json:"launchTime,omitempty"`
	SecurityGroups   []string      `json:"securityGroups,omitempty"`
	Tags             []DetailField `json:"tags,omitempty"`
}

// AwsLambdaFunction models a Lambda function for inventory (list + describe).
// RecentLogs populated on describe for the function's CloudWatch log group.
type AwsLambdaFunction struct {
	FunctionName string   `json:"functionName"`
	Runtime      string   `json:"runtime,omitempty"`
	MemorySize   int32    `json:"memorySize,omitempty"`
	LastModified string   `json:"lastModified,omitempty"`
	Description  string   `json:"description,omitempty"`
	State        string   `json:"state,omitempty"`
	CodeSize     int64    `json:"codeSize,omitempty"`
	Handler      string   `json:"handler,omitempty"`
	Timeout      int32    `json:"timeout,omitempty"`
	LogGroup     string   `json:"logGroup,omitempty"`
	RecentLogs   []string `json:"recentLogs,omitempty"`
}

// AwsLambdaInvokeResult is the (safe) write action result for testing a function.
type AwsLambdaInvokeResult struct {
	StatusCode      int32  `json:"statusCode"`
	ExecutedVersion string `json:"executedVersion,omitempty"`
	FunctionError   string `json:"functionError,omitempty"`
	LogResult       string `json:"logResult,omitempty"`
	Payload         string `json:"payload,omitempty"`
	Error           string `json:"error,omitempty"`
}

// AwsDynamoDBGlobalSecondaryIndex summarises a GSI on a DynamoDB table.
type AwsDynamoDBGlobalSecondaryIndex struct {
	IndexName string `json:"indexName"`
	HashKey   string `json:"hashKey,omitempty"`
	RangeKey  string `json:"rangeKey,omitempty"`
	Status    string `json:"status,omitempty"`
}

// AwsDynamoDBTable models a DynamoDB table for inventory (list + describe).
type AwsDynamoDBTable struct {
	TableName              string                            `json:"tableName"`
	Status                 string                            `json:"status,omitempty"`
	ItemCount              int64                             `json:"itemCount,omitempty"`
	TableSizeBytes         int64                             `json:"tableSizeBytes,omitempty"`
	BillingMode            string                            `json:"billingMode,omitempty"`
	HashKey                string                            `json:"hashKey,omitempty"`
	RangeKey               string                            `json:"rangeKey,omitempty"`
	GlobalSecondaryIndexes []AwsDynamoDBGlobalSecondaryIndex `json:"globalSecondaryIndexes,omitempty"`
	SampleItems            []string                          `json:"sampleItems,omitempty"`
}

// AwsLambdaCreateInput deploys a function to a local endpoint profile.
// Provide HandlerSource for inline code, ZipSourcePath for a local zip file,
// or omit both to use the built-in starter template.
type AwsLambdaCreateInput struct {
	FunctionName   string `json:"functionName"`
	Runtime        string `json:"runtime"`
	Handler        string `json:"handler,omitempty"`
	MemorySize     int32  `json:"memorySize,omitempty"`
	Timeout        int32  `json:"timeout,omitempty"`
	Description    string `json:"description,omitempty"`
	HandlerSource  string `json:"handlerSource,omitempty"`
	ZipSourcePath  string `json:"zipSourcePath,omitempty"`
}

type AzureResourceGroup struct {
	Name              string        `json:"name"`
	Location          string        `json:"location,omitempty"`
	ProvisioningState string        `json:"provisioningState,omitempty"`
	ManagedBy         string        `json:"managedBy,omitempty"`
	Tags              []DetailField `json:"tags,omitempty"`
}

type AzureVirtualMachine struct {
	VMID              string        `json:"vmId"`
	Name              string        `json:"name"`
	ResourceGroup     string        `json:"resourceGroup,omitempty"`
	Location          string        `json:"location,omitempty"`
	PowerState        string        `json:"powerState,omitempty"`
	ProvisioningState string        `json:"provisioningState,omitempty"`
	Size              string        `json:"size,omitempty"`
	OSType            string        `json:"osType,omitempty"`
	PrivateIP         string        `json:"privateIp,omitempty"`
	PublicIP          string        `json:"publicIp,omitempty"`
	Tags              []DetailField `json:"tags,omitempty"`
}

type WorkspaceSnapshot struct {
	Provider                   *ProviderSummary        `json:"provider,omitempty"`
	Profile                    *ProfileSummary         `json:"profile,omitempty"`
	AuthMethod                 AuthMethod              `json:"authMethod,omitempty"`
	RuntimeSettings            AppSettingsSnapshot     `json:"runtimeSettings"`
	EnvironmentDiagnostics     []DetailField           `json:"environmentDiagnostics"`
	DockerDiagnostics          DockerDiagnostics       `json:"dockerDiagnostics"`
	DockerRuntime              DockerRuntimeSnapshot   `json:"dockerRuntime"`
	DockerResources            []ManagedDockerResource `json:"dockerResources"`
	EmulatorSummaries          []EmulatorSummary       `json:"emulatorSummaries"`
	LocalConfigArtifacts       []LocalConfigArtifact   `json:"localConfigArtifacts"`
	AWSEndpointURL             string                  `json:"awsEndpointUrl,omitempty"`
	AWSWritesEnabled           bool                    `json:"awsWritesEnabled"`
	SelectedS3BucketName       string                  `json:"selectedS3BucketName,omitempty"`
	SelectedS3ObjectKey        string                  `json:"selectedS3ObjectKey,omitempty"`
	S3PrefixFilter             string                  `json:"s3PrefixFilter,omitempty"`
	S3StatusMessage            string                  `json:"s3StatusMessage,omitempty"`
	S3Buckets                  []AwsS3Bucket           `json:"s3Buckets"`
	S3Objects                  []AwsS3Object           `json:"s3Objects"`
	S3ObjectMetadata           []DetailField           `json:"s3ObjectMetadata"`
	S3ExportSnippets           []AwsS3ExportSnippet    `json:"s3ExportSnippets"`
	SelectedEC2Region          string                  `json:"selectedEc2Region,omitempty"`
	SelectedEC2InstanceID      string                  `json:"selectedEc2InstanceId,omitempty"`
	EC2StatusMessage           string                  `json:"ec2StatusMessage,omitempty"`
	EC2Regions                 []string                `json:"ec2Regions"`
	EC2Instances               []AwsEc2Instance        `json:"ec2Instances"`
	SelectedLambdaRegion       string                  `json:"selectedLambdaRegion,omitempty"`
	SelectedLambdaFunctionName string                  `json:"selectedLambdaFunctionName,omitempty"`
	LambdaStatusMessage        string                  `json:"lambdaStatusMessage,omitempty"`
	LambdaRegions              []string                `json:"lambdaRegions"`
	LambdaFunctions            []AwsLambdaFunction     `json:"lambdaFunctions"`
	SelectedDynamoDBRegion     string                  `json:"selectedDynamodbRegion,omitempty"`
	SelectedDynamoDBTableName  string                  `json:"selectedDynamodbTableName,omitempty"`
	DynamoDBStatusMessage      string                  `json:"dynamodbStatusMessage,omitempty"`
	DynamoDBRegions            []string                `json:"dynamodbRegions"`
	DynamoDBTables             []AwsDynamoDBTable      `json:"dynamodbTables"`
	SelectedAzureResourceGroup string                  `json:"selectedAzureResourceGroup,omitempty"`
	SelectedAzureVMID          string                  `json:"selectedAzureVmId,omitempty"`
	AzureStatusMessage         string                  `json:"azureStatusMessage,omitempty"`
	AzureResourceGroups        []AzureResourceGroup    `json:"azureResourceGroups"`
	AzureVirtualMachines       []AzureVirtualMachine   `json:"azureVirtualMachines"`
}

type ActivityLogEntry struct {
	ID        int64  `json:"id"`
	Level     string `json:"level"`
	Message   string `json:"message"`
	Timestamp string `json:"timestamp"`
	Details   string `json:"details,omitempty"`
}

type AppSettingsSnapshot struct {
	PlatformName     string      `json:"platformName"`
	ConfigDir        string      `json:"configDir"`
	DatabasePath     string      `json:"databasePath"`
	LogPath          string      `json:"logPath"`
	RuntimeMode      RuntimeMode `json:"runtimeMode"`
	LocalConfigDir   string      `json:"localConfigDir"`
	EmulatorStateDir string      `json:"emulatorStateDir"`
	LocalStackImage  string      `json:"localStackImage"`
	FlociAZImage     string      `json:"flociAzImage"`
}

type JobStatus struct {
	JobID       string `json:"jobId"`
	Label       string `json:"label"`
	Status      string `json:"status"`
	Message     string `json:"message"`
	CompletedAt string `json:"completedAt,omitempty"`
	Result      any    `json:"result,omitempty"`
}

type StateChangedPayload struct {
	Providers []ProviderSummary `json:"providers"`
	Profiles  []ProfileSummary  `json:"profiles"`
	Session   SessionSnapshot   `json:"session"`
}

type AppResetResult struct {
	Summary      string   `json:"summary"`
	ResetPaths   []string `json:"resetPaths"`
	SkippedPaths []string `json:"skippedPaths"`
}
