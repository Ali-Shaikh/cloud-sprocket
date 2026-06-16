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
	// Recreate stops and removes any existing managed container, then creates a new one.
	Recreate bool `json:"recreate,omitempty"`
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
	SelectedSQSRegion          string             `json:"selectedSqsRegion,omitempty"`
	SelectedSQSQueueURL        string             `json:"selectedSqsQueueUrl,omitempty"`
	SelectedSNSRegion          string             `json:"selectedSnsRegion,omitempty"`
	SelectedSNSTopicArn      string             `json:"selectedSnsTopicArn,omitempty"`
	SelectedRDSRegion          string             `json:"selectedRdsRegion,omitempty"`
	SelectedRDSInstanceID      string             `json:"selectedRdsInstanceId,omitempty"`
	SelectedLogsRegion         string             `json:"selectedLogsRegion,omitempty"`
	SelectedLogGroupName       string             `json:"selectedLogGroupName,omitempty"`
	SelectedIAMRoleName        string             `json:"selectedIamRoleName,omitempty"`
	AWSWriteModeEnabled        bool               `json:"awsWriteModeEnabled,omitempty"`
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

// AwsSqsQueue models an SQS queue for inventory (list + describe).
type AwsSqsQueue struct {
	QueueName                            string `json:"queueName"`
	QueueURL                             string `json:"queueUrl"`
	ApproximateNumberOfMessages          int64  `json:"approximateNumberOfMessages,omitempty"`
	ApproximateNumberOfMessagesNotVisible int64 `json:"approximateNumberOfMessagesNotVisible,omitempty"`
	ApproximateNumberOfMessagesDelayed   int64  `json:"approximateNumberOfMessagesDelayed,omitempty"`
	VisibilityTimeout                    int32  `json:"visibilityTimeout,omitempty"`
	CreatedTimestamp                     int64  `json:"createdTimestamp,omitempty"`
	QueueArn                             string `json:"queueArn,omitempty"`
	DelaySeconds                         int32  `json:"delaySeconds,omitempty"`
	ReceiveMessageWaitTimeSeconds        int32  `json:"receiveMessageWaitTimeSeconds,omitempty"`
}

// AwsSqsMessage is a peeked queue message (not deleted).
type AwsSqsMessage struct {
	MessageID               string `json:"messageId"`
	Body                    string `json:"body"`
	ReceiptHandle           string `json:"receiptHandle,omitempty"`
	SentTimestamp           int64  `json:"sentTimestamp,omitempty"`
	ApproximateReceiveCount int64  `json:"approximateReceiveCount,omitempty"`
}

// AwsSqsPeekResult is the safe write action result for bounded message peek.
type AwsSqsPeekResult struct {
	QueueURL string          `json:"queueUrl"`
	Messages []AwsSqsMessage `json:"messages"`
	Summary  string          `json:"summary"`
}

// AwsSnsSubscription models an SNS topic subscription.
type AwsSnsSubscription struct {
	SubscriptionArn string `json:"subscriptionArn"`
	Protocol        string `json:"protocol,omitempty"`
	Endpoint        string `json:"endpoint,omitempty"`
	Owner           string `json:"owner,omitempty"`
}

// AwsSnsTopic models an SNS topic for inventory (list + describe).
type AwsSnsTopic struct {
	TopicArn               string               `json:"topicArn"`
	TopicName              string               `json:"topicName"`
	DisplayName            string               `json:"displayName,omitempty"`
	Owner                  string               `json:"owner,omitempty"`
	SubscriptionsConfirmed string               `json:"subscriptionsConfirmed,omitempty"`
	SubscriptionsPending   string               `json:"subscriptionsPending,omitempty"`
	Subscriptions          []AwsSnsSubscription `json:"subscriptions,omitempty"`
}

// AwsRdsInstance models an RDS DB instance for inventory.
type AwsRdsInstance struct {
	DBInstanceIdentifier string `json:"dbInstanceIdentifier"`
	Engine               string `json:"engine,omitempty"`
	EngineVersion        string `json:"engineVersion,omitempty"`
	Status               string `json:"status,omitempty"`
	InstanceClass        string `json:"instanceClass,omitempty"`
	Endpoint             string `json:"endpoint,omitempty"`
	EndpointAddress      string `json:"endpointAddress,omitempty"`
	EndpointPort         int32  `json:"endpointPort,omitempty"`
	AvailabilityZone     string `json:"availabilityZone,omitempty"`
	AllocatedStorage     int32  `json:"allocatedStorage,omitempty"`
	MultiAZ              bool   `json:"multiAz,omitempty"`
	StorageEncrypted     bool   `json:"storageEncrypted,omitempty"`
}

// AwsLogGroup models a CloudWatch Logs group for inventory.
type AwsLogGroup struct {
	LogGroupName    string   `json:"logGroupName"`
	Arn             string   `json:"arn,omitempty"`
	StoredBytes     int64    `json:"storedBytes,omitempty"`
	RetentionInDays int32    `json:"retentionInDays,omitempty"`
	CreationTime    int64    `json:"creationTime,omitempty"`
	RecentEvents    []string `json:"recentEvents,omitempty"`
}

// AwsIamRole models an IAM role for read-only inventory.
type AwsIamRole struct {
	RoleName         string   `json:"roleName"`
	RoleArn          string   `json:"roleArn,omitempty"`
	Path             string   `json:"path,omitempty"`
	Description      string   `json:"description,omitempty"`
	CreateDate       string   `json:"createDate,omitempty"`
	AttachedPolicies []string `json:"attachedPolicies,omitempty"`
}

// AwsIamPolicy models a customer-managed IAM policy for read-only inventory.
type AwsIamPolicy struct {
	PolicyName      string `json:"policyName"`
	PolicyArn       string `json:"policyArn,omitempty"`
	AttachmentCount int32  `json:"attachmentCount,omitempty"`
	UpdateDate      string `json:"updateDate,omitempty"`
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
	AWSWriteCapable            bool                    `json:"awsWriteCapable"`
	AWSWriteModeEnabled        bool                    `json:"awsWriteModeEnabled"`
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
	SelectedSQSRegion          string                  `json:"selectedSqsRegion,omitempty"`
	SelectedSQSQueueURL        string                  `json:"selectedSqsQueueUrl,omitempty"`
	SQSStatusMessage           string                  `json:"sqsStatusMessage,omitempty"`
	SQSRegions                 []string                `json:"sqsRegions"`
	SQSQueues                  []AwsSqsQueue           `json:"sqsQueues"`
	SelectedSNSRegion          string                  `json:"selectedSnsRegion,omitempty"`
	SelectedSNSTopicArn        string                  `json:"selectedSnsTopicArn,omitempty"`
	SNSStatusMessage           string                  `json:"snsStatusMessage,omitempty"`
	SNSRegions                 []string                `json:"snsRegions"`
	SNSTopics                  []AwsSnsTopic           `json:"snsTopics"`
	SelectedRDSRegion          string                  `json:"selectedRdsRegion,omitempty"`
	SelectedRDSInstanceID      string                  `json:"selectedRdsInstanceId,omitempty"`
	RDSStatusMessage           string                  `json:"rdsStatusMessage,omitempty"`
	RDSRegions                 []string                `json:"rdsRegions"`
	RDSInstances               []AwsRdsInstance        `json:"rdsInstances"`
	SelectedLogsRegion         string                  `json:"selectedLogsRegion,omitempty"`
	SelectedLogGroupName       string                  `json:"selectedLogGroupName,omitempty"`
	LogsStatusMessage          string                  `json:"logsStatusMessage,omitempty"`
	LogsRegions                []string                `json:"logsRegions"`
	LogGroups                  []AwsLogGroup           `json:"logGroups"`
	SelectedIAMRoleName        string                  `json:"selectedIamRoleName,omitempty"`
	IAMStatusMessage           string                  `json:"iamStatusMessage,omitempty"`
	IAMRoles                   []AwsIamRole            `json:"iamRoles"`
	IAMPolicies                []AwsIamPolicy          `json:"iamPolicies"`
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
