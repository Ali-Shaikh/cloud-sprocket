// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

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

// ActionCapability describes whether a single mutating UI action is available
// and why it may be disabled (write mode, profile, runtime reachability).
type ActionCapability struct {
	ActionID string `json:"actionId"`
	Label    string `json:"label"`
	Enabled  bool   `json:"enabled"`
	Reason   string `json:"reason,omitempty"`
}

// AzureCLIExtensionStatus reports whether a required Azure CLI extension is
// installed for cloud profile workbenches.
type AzureCLIExtensionStatus struct {
	Name           string `json:"name"`
	Summary        string `json:"summary"`
	Installed      bool   `json:"installed"`
	InstallCommand string `json:"installCommand"`
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
	TabID    string `json:"tabId"`
	Label    string `json:"label"`
	Summary  string `json:"summary"`
	Detail   string `json:"detail"`
	Category string `json:"category,omitempty"`
	// Domain groups service tabs by type in the sidebar (compute, storage, ...).
	// Empty for workspace shell tabs and operational tools.
	Domain string `json:"domain,omitempty"`
}

// ServicePreferences stores globally disabled providers and services. Absence of
// config or empty sets means everything is enabled.
type ServicePreferences struct {
	DisabledProviders []string            `json:"disabledProviders"`
	DisabledServices  map[string][]string `json:"disabledServices"`
}

// ServiceCatalogEntry describes a toggleable provider service or tool.
type ServiceCatalogEntry struct {
	ProviderID     string `json:"providerId"`
	ServiceID      string `json:"serviceId"`
	Label          string `json:"label"`
	Summary        string `json:"summary"`
	Detail         string `json:"detail"`
	Category       string `json:"category"`
	Domain         string `json:"domain,omitempty"`
	InventoryScope string `json:"inventoryScope,omitempty"`
	Enabled        bool   `json:"enabled"`
}

// PreferencesSnapshot is returned by preferences.get and preferences.update.
type PreferencesSnapshot struct {
	Preferences ServicePreferences    `json:"preferences"`
	Catalogue   []ServiceCatalogEntry `json:"catalogue"`
}

// HiddenResourceHit reports inventory found in a disabled service tab.
type HiddenResourceHit struct {
	ProviderID    string `json:"providerId"`
	ServiceID     string `json:"serviceId"`
	Label         string `json:"label"`
	ResourceCount int    `json:"resourceCount"`
}

// HiddenResourcesSnapshot is returned by preferences.hiddenResources.get.
type HiddenResourcesSnapshot struct {
	Hits []HiddenResourceHit `json:"hits"`
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

type EmulatorStatusDetail struct {
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

type EmulatorStartOptions struct {
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
	EmulatorID string               `json:"emulatorId"`
	Action     string               `json:"action"`
	State      EmulatorActionState  `json:"state"`
	Summary    string               `json:"summary"`
	Status     EmulatorStatusDetail `json:"status"`
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
	CurrentProviderID                 string             `json:"currentProviderId,omitempty"`
	SelectedProfileID                 string             `json:"selectedProfileId,omitempty"`
	SelectedAuthMethod                AuthMethod         `json:"selectedAuthMethod,omitempty"`
	SelectedAzureResourceGroup        string             `json:"selectedAzureResourceGroup,omitempty"`
	SelectedAzureVMID                 string             `json:"selectedAzureVmId,omitempty"`
	SelectedAzureStorageAccount       string             `json:"selectedAzureStorageAccount,omitempty"`
	SelectedAzureBlobContainer        string             `json:"selectedAzureBlobContainer,omitempty"`
	SelectedAzureBlobName             string             `json:"selectedAzureBlobName,omitempty"`
	AzureBlobPrefixFilter             string             `json:"azureBlobPrefixFilter,omitempty"`
	SelectedAzureWebAppName           string             `json:"selectedAzureWebAppName,omitempty"`
	SelectedAzureWebAppSlot           string             `json:"selectedAzureWebAppSlot,omitempty"`
	SelectedAzureLogWorkspace         string             `json:"selectedAzureLogWorkspace,omitempty"`
	SelectedAzureWafPolicy            string             `json:"selectedAzureWafPolicy,omitempty"`
	SelectedAzureFunctionApp          string             `json:"selectedAzureFunctionApp,omitempty"`
	SelectedAzureFunction             string             `json:"selectedAzureFunction,omitempty"`
	SelectedAzureKeyVault             string             `json:"selectedAzureKeyVault,omitempty"`
	SelectedAzureSecret               string             `json:"selectedAzureSecret,omitempty"`
	SelectedAzureCosmosAccount        string             `json:"selectedAzureCosmosAccount,omitempty"`
	SelectedAzureCosmosDatabase       string             `json:"selectedAzureCosmosDatabase,omitempty"`
	SelectedAzureCosmosContainer      string             `json:"selectedAzureCosmosContainer,omitempty"`
	SelectedAzurePostgresServer       string             `json:"selectedAzurePostgresServer,omitempty"`
	SelectedAzureFrontDoorProfile     string             `json:"selectedAzureFrontDoorProfile,omitempty"`
	SelectedAzureFrontDoorEndpoint    string             `json:"selectedAzureFrontDoorEndpoint,omitempty"`
	SelectedAzureFrontDoorOriginGroup string             `json:"selectedAzureFrontDoorOriginGroup,omitempty"`
	SelectedAzureQueue                string             `json:"selectedAzureQueue,omitempty"`
	AzureWriteModeEnabled             bool               `json:"azureWriteModeEnabled,omitempty"`
	SelectedS3BucketName              string             `json:"selectedS3BucketName,omitempty"`
	SelectedS3ObjectKey               string             `json:"selectedS3ObjectKey,omitempty"`
	S3PrefixFilter                    string             `json:"s3PrefixFilter,omitempty"`
	SelectedGcpStorageBucket          string             `json:"selectedGcpStorageBucket,omitempty"`
	GcpStoragePrefixFilter            string             `json:"gcpStoragePrefixFilter,omitempty"`
	SelectedGcpComputeInstance        string             `json:"selectedGcpComputeInstance,omitempty"`
	GcpWriteModeEnabled               bool               `json:"gcpWriteModeEnabled,omitempty"`
	SelectedEC2Region                 string             `json:"selectedEc2Region,omitempty"`
	SelectedEC2InstanceID             string             `json:"selectedEc2InstanceId,omitempty"`
	SelectedLambdaRegion              string             `json:"selectedLambdaRegion,omitempty"`
	SelectedLambdaFunctionName        string             `json:"selectedLambdaFunctionName,omitempty"`
	SelectedDynamoDBRegion            string             `json:"selectedDynamodbRegion,omitempty"`
	SelectedDynamoDBTableName         string             `json:"selectedDynamodbTableName,omitempty"`
	SelectedSQSRegion                 string             `json:"selectedSqsRegion,omitempty"`
	SelectedSQSQueueURL               string             `json:"selectedSqsQueueUrl,omitempty"`
	SelectedSNSRegion                 string             `json:"selectedSnsRegion,omitempty"`
	SelectedSNSTopicArn               string             `json:"selectedSnsTopicArn,omitempty"`
	SelectedRDSRegion                 string             `json:"selectedRdsRegion,omitempty"`
	SelectedRDSInstanceID             string             `json:"selectedRdsInstanceId,omitempty"`
	SelectedECSRegion                 string             `json:"selectedEcsRegion,omitempty"`
	SelectedECSClusterArn             string             `json:"selectedEcsClusterArn,omitempty"`
	SelectedECSServiceArn             string             `json:"selectedEcsServiceArn,omitempty"`
	SelectedECSTaskArn                string             `json:"selectedEcsTaskArn,omitempty"`
	SelectedEKSRegion                 string             `json:"selectedEksRegion,omitempty"`
	SelectedEKSClusterName            string             `json:"selectedEksClusterName,omitempty"`
	SelectedCloudFormationRegion      string             `json:"selectedCloudFormationRegion,omitempty"`
	SelectedCloudFormationStackName   string             `json:"selectedCloudFormationStackName,omitempty"`
	SelectedEventBridgeRegion         string             `json:"selectedEventBridgeRegion,omitempty"`
	SelectedEventBridgeBusName        string             `json:"selectedEventBridgeBusName,omitempty"`
	SelectedRoute53HostedZoneID       string             `json:"selectedRoute53HostedZoneId,omitempty"`
	SelectedElbRegion                 string             `json:"selectedElbRegion,omitempty"`
	SelectedElbLoadBalancerArn        string             `json:"selectedElbLoadBalancerArn,omitempty"`
	SelectedKmsRegion                 string             `json:"selectedKmsRegion,omitempty"`
	SelectedKmsKeyId                  string             `json:"selectedKmsKeyId,omitempty"`
	SelectedApiGatewayRegion          string             `json:"selectedApiGatewayRegion,omitempty"`
	SelectedApiGatewayApiKey          string             `json:"selectedApiGatewayApiKey,omitempty"`
	SelectedSecretsManagerRegion      string             `json:"selectedSecretsManagerRegion,omitempty"`
	SelectedSecretsManagerName        string             `json:"selectedSecretsManagerName,omitempty"`
	SelectedLogsRegion                string             `json:"selectedLogsRegion,omitempty"`
	SelectedLogGroupName              string             `json:"selectedLogGroupName,omitempty"`
	SelectedIAMRoleName               string             `json:"selectedIamRoleName,omitempty"`
	AWSWriteModeEnabled               bool               `json:"awsWriteModeEnabled,omitempty"`
	LockedProviderID                  string             `json:"lockedProviderId,omitempty"`
	LockedProfileID                   string             `json:"lockedProfileId,omitempty"`
	LockedAuthMethod                  AuthMethod         `json:"lockedAuthMethod,omitempty"`
	IsLocked                          bool               `json:"isLocked"`
	AvailableAuthMethods              []AuthMethodStatus `json:"availableAuthMethods"`
	WorkspaceTabs                     []WorkspaceTab     `json:"workspaceTabs"`
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
	// IsFolder marks a CommonPrefixes "virtual folder" from delimiter listing.
	IsFolder bool `json:"isFolder,omitempty"`
}

// AwsS3ObjectListPage is one delimiter-scoped page of folders and objects.
type AwsS3ObjectListPage struct {
	Entries               []AwsS3Object `json:"entries"`
	NextContinuationToken string        `json:"nextContinuationToken,omitempty"`
	IsTruncated           bool          `json:"isTruncated,omitempty"`
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
	QueueName                             string `json:"queueName"`
	QueueURL                              string `json:"queueUrl"`
	ApproximateNumberOfMessages           int64  `json:"approximateNumberOfMessages,omitempty"`
	ApproximateNumberOfMessagesNotVisible int64  `json:"approximateNumberOfMessagesNotVisible,omitempty"`
	ApproximateNumberOfMessagesDelayed    int64  `json:"approximateNumberOfMessagesDelayed,omitempty"`
	VisibilityTimeout                     int32  `json:"visibilityTimeout,omitempty"`
	CreatedTimestamp                      int64  `json:"createdTimestamp,omitempty"`
	QueueArn                              string `json:"queueArn,omitempty"`
	DelaySeconds                          int32  `json:"delaySeconds,omitempty"`
	ReceiveMessageWaitTimeSeconds         int32  `json:"receiveMessageWaitTimeSeconds,omitempty"`
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

// AwsSqsSendResult is the result of sending a message to a queue.
type AwsSqsSendResult struct {
	QueueURL  string `json:"queueUrl"`
	MessageID string `json:"messageId"`
	Summary   string `json:"summary"`
}

// AwsSqsCreateQueueResult is the result of creating a new queue.
type AwsSqsCreateQueueResult struct {
	QueueName string `json:"queueName"`
	QueueURL  string `json:"queueUrl"`
}

// AwsSnsPublishResult is the result of publishing to an SNS topic.
type AwsSnsPublishResult struct {
	TopicArn  string `json:"topicArn"`
	MessageID string `json:"messageId"`
	Summary   string `json:"summary"`
}

// AwsSnsCreateTopicResult is the result of creating an SNS topic.
type AwsSnsCreateTopicResult struct {
	TopicName string `json:"topicName"`
	TopicArn  string `json:"topicArn"`
}

// AwsDynamoDBWriteResult is the result of a DynamoDB put or delete action.
type AwsDynamoDBWriteResult struct {
	TableName string `json:"tableName"`
	Summary   string `json:"summary"`
}

type AwsS3DeleteObjectResult struct {
	BucketName string `json:"bucketName"`
	ObjectKey  string `json:"objectKey"`
	Summary    string `json:"summary"`
}

type AwsS3CreateBucketResult struct {
	BucketName string `json:"bucketName"`
	Region     string `json:"region"`
}

type AwsS3CopyObjectResult struct {
	BucketName           string `json:"bucketName"`
	SourceObjectKey      string `json:"sourceObjectKey"`
	DestinationObjectKey string `json:"destinationObjectKey"`
	DestinationURI       string `json:"destinationUri"`
}

type AwsS3CreateFolderPrefixResult struct {
	BucketName   string `json:"bucketName"`
	FolderPrefix string `json:"folderPrefix"`
}

type AwsEc2RunInstancesResult struct {
	InstanceID   string `json:"instanceId"`
	Region       string `json:"region"`
	InstanceType string `json:"instanceType"`
	Summary      string `json:"summary"`
}

type AwsLambdaDeleteFunctionResult struct {
	FunctionName string `json:"functionName"`
	Summary      string `json:"summary"`
}

type AwsRdsLifecycleResult struct {
	DBInstanceIdentifier string `json:"dbInstanceIdentifier"`
	Action               string `json:"action"`
	Summary              string `json:"summary"`
}

type AwsLogsCreateLogGroupResult struct {
	LogGroupName string `json:"logGroupName"`
	Region       string `json:"region"`
}

type AwsLogsPutLogEventsResult struct {
	LogGroupName  string `json:"logGroupName"`
	LogStreamName string `json:"logStreamName"`
	Summary       string `json:"summary"`
}

// AwsLogsFilterEventsResult is a bounded CloudWatch Logs filter/search response.
type AwsLogsFilterEventsResult struct {
	LogGroupName  string   `json:"logGroupName"`
	FilterPattern string   `json:"filterPattern,omitempty"`
	Events        []string `json:"events"`
	Summary       string   `json:"summary"`
}

type AwsIamCreateRoleResult struct {
	RoleName string `json:"roleName"`
	RoleArn  string `json:"roleArn"`
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

// AwsApiGatewayApi models a REST or HTTP/WebSocket API Gateway API.
type AwsApiGatewayApi struct {
	ApiKey      string `json:"apiKey"`
	ApiId       string `json:"apiId"`
	ApiName     string `json:"apiName"`
	ApiType     string `json:"apiType"`
	Description string `json:"description,omitempty"`
	Endpoint    string `json:"endpoint,omitempty"`
	Protocol    string `json:"protocol,omitempty"`
}

// AwsApiGatewayStage models a deployed API Gateway stage.
type AwsApiGatewayStage struct {
	ApiKey       string `json:"apiKey"`
	StageName    string `json:"stageName"`
	InvokeUrl    string `json:"invokeUrl,omitempty"`
	DeploymentId string `json:"deploymentId,omitempty"`
	Description  string `json:"description,omitempty"`
	AutoDeploy   bool   `json:"autoDeploy,omitempty"`
}

// AwsApiGatewayListResult carries API inventory with an optional partial-failure warning.
type AwsApiGatewayListResult struct {
	Apis    []AwsApiGatewayApi `json:"apis"`
	Warning string             `json:"warning,omitempty"`
}

// AwsSecretsManagerSecret models Secrets Manager secret metadata (no value).
type AwsSecretsManagerSecret struct {
	Arn              string `json:"arn"`
	Name             string `json:"name"`
	Description      string `json:"description,omitempty"`
	LastChangedDate  string `json:"lastChangedDate,omitempty"`
	LastAccessedDate string `json:"lastAccessedDate,omitempty"`
	// Pointer so false (disabled) serialises distinctly from unknown/omitted.
	RotationEnabled *bool `json:"rotationEnabled,omitempty"`
}

// AwsEcsCluster models an ECS cluster for inventory.
type AwsEcsCluster struct {
	ClusterArn                        string `json:"clusterArn"`
	ClusterName                       string `json:"clusterName"`
	Status                            string `json:"status,omitempty"`
	RunningTasksCount                 int32  `json:"runningTasksCount,omitempty"`
	PendingTasksCount                 int32  `json:"pendingTasksCount,omitempty"`
	ActiveServicesCount               int32  `json:"activeServicesCount,omitempty"`
	RegisteredContainerInstancesCount int32  `json:"registeredContainerInstancesCount,omitempty"`
}

// AwsEcsService models an ECS service for inventory.
type AwsEcsService struct {
	ServiceArn     string `json:"serviceArn"`
	ServiceName    string `json:"serviceName"`
	Status         string `json:"status,omitempty"`
	DesiredCount   int32  `json:"desiredCount,omitempty"`
	RunningCount   int32  `json:"runningCount,omitempty"`
	PendingCount   int32  `json:"pendingCount,omitempty"`
	LaunchType     string `json:"launchType,omitempty"`
	TaskDefinition string `json:"taskDefinition,omitempty"`
}

// AwsEcsForceNewDeploymentResult reports a successful force-new-deployment action.
type AwsEcsForceNewDeploymentResult struct {
	ClusterArn  string `json:"clusterArn"`
	ServiceArn  string `json:"serviceArn"`
	ServiceName string `json:"serviceName"`
	Region      string `json:"region"`
	Summary     string `json:"summary"`
}

// AwsEcsContainer models a container within an ECS task.
type AwsEcsContainer struct {
	Name       string `json:"name"`
	Image      string `json:"image,omitempty"`
	LastStatus string `json:"lastStatus,omitempty"`
}

// AwsEcsTask models an ECS task for inventory.
type AwsEcsTask struct {
	TaskArn           string            `json:"taskArn"`
	TaskDefinitionArn string            `json:"taskDefinitionArn,omitempty"`
	LastStatus        string            `json:"lastStatus,omitempty"`
	DesiredStatus     string            `json:"desiredStatus,omitempty"`
	LaunchType        string            `json:"launchType,omitempty"`
	StartedAt         string            `json:"startedAt,omitempty"`
	Group             string            `json:"group,omitempty"`
	Containers        []AwsEcsContainer `json:"containers,omitempty"`
}

// AwsEksCluster models an EKS cluster for inventory.
type AwsEksCluster struct {
	ClusterArn      string `json:"clusterArn"`
	ClusterName     string `json:"clusterName"`
	Status          string `json:"status,omitempty"`
	Version         string `json:"version,omitempty"`
	Endpoint        string `json:"endpoint,omitempty"`
	PlatformVersion string `json:"platformVersion,omitempty"`
	RoleArn         string `json:"roleArn,omitempty"`
}

// AwsCloudFormationStack models a CloudFormation stack for inventory.
type AwsCloudFormationStack struct {
	StackId         string `json:"stackId"`
	StackName       string `json:"stackName"`
	StackStatus     string `json:"stackStatus,omitempty"`
	CreationTime    string `json:"creationTime,omitempty"`
	LastUpdatedTime string `json:"lastUpdatedTime,omitempty"`
	Description     string `json:"description,omitempty"`
}

// AwsCloudFormationStackEvent models a recent CloudFormation stack event.
type AwsCloudFormationStackEvent struct {
	EventId              string `json:"eventId"`
	Timestamp            string `json:"timestamp,omitempty"`
	LogicalResourceId    string `json:"logicalResourceId,omitempty"`
	ResourceStatus       string `json:"resourceStatus,omitempty"`
	ResourceType         string `json:"resourceType,omitempty"`
	ResourceStatusReason string `json:"resourceStatusReason,omitempty"`
}

// AwsEventBridgeBus models an EventBridge event bus for inventory.
type AwsEventBridgeBus struct {
	Name string `json:"name"`
	Arn  string `json:"arn,omitempty"`
}

// AwsEventBridgeRule models an EventBridge rule for inventory.
type AwsEventBridgeRule struct {
	Name               string `json:"name"`
	Arn                string `json:"arn,omitempty"`
	State              string `json:"state,omitempty"`
	Description        string `json:"description,omitempty"`
	ScheduleExpression string `json:"scheduleExpression,omitempty"`
	EventPattern       string `json:"eventPattern,omitempty"`
}

// AwsRoute53HostedZone models a Route 53 hosted zone for inventory.
type AwsRoute53HostedZone struct {
	HostedZoneID string `json:"hostedZoneId"`
	Name         string `json:"name"`
	RecordCount  int64  `json:"recordCount,omitempty"`
	PrivateZone  bool   `json:"privateZone,omitempty"`
	Comment      string `json:"comment,omitempty"`
}

// AwsRoute53ResourceRecordSet models a Route 53 record preview for inventory.
type AwsRoute53ResourceRecordSet struct {
	Name          string   `json:"name"`
	Type          string   `json:"type,omitempty"`
	SetIdentifier string   `json:"setIdentifier,omitempty"`
	TTL           int64    `json:"ttl,omitempty"`
	Values        []string `json:"values,omitempty"`
	AliasTarget   string   `json:"aliasTarget,omitempty"`
}

// AwsElbLoadBalancer models an ELBv2 load balancer for inventory.
type AwsElbLoadBalancer struct {
	LoadBalancerArn  string `json:"loadBalancerArn"`
	LoadBalancerName string `json:"loadBalancerName"`
	DNSName          string `json:"dnsName,omitempty"`
	Type             string `json:"type,omitempty"`
	Scheme           string `json:"scheme,omitempty"`
	State            string `json:"state,omitempty"`
	VpcID            string `json:"vpcId,omitempty"`
	CreatedTime      string `json:"createdTime,omitempty"`
}

// AwsElbTargetGroup models an ELBv2 target group for inventory.
type AwsElbTargetGroup struct {
	TargetGroupArn  string `json:"targetGroupArn"`
	TargetGroupName string `json:"targetGroupName"`
	Protocol        string `json:"protocol,omitempty"`
	Port            int32  `json:"port,omitempty"`
	TargetType      string `json:"targetType,omitempty"`
	VpcID           string `json:"vpcId,omitempty"`
	HealthCheckPath string `json:"healthCheckPath,omitempty"`
}

// AwsKmsKey models a KMS key for inventory.
type AwsKmsKey struct {
	KeyId        string `json:"keyId"`
	Arn          string `json:"arn,omitempty"`
	Description  string `json:"description,omitempty"`
	KeyUsage     string `json:"keyUsage,omitempty"`
	KeyState     string `json:"keyState,omitempty"`
	KeySpec      string `json:"keySpec,omitempty"`
	Origin       string `json:"origin,omitempty"`
	CreationDate string `json:"creationDate,omitempty"`
	DeletionDate string `json:"deletionDate,omitempty"`
	MultiRegion  bool   `json:"multiRegion,omitempty"`
	Enabled      bool   `json:"enabled,omitempty"`
}

// AwsKmsAlias models a KMS alias for inventory.
type AwsKmsAlias struct {
	AliasName   string `json:"aliasName"`
	AliasArn    string `json:"aliasArn,omitempty"`
	TargetKeyId string `json:"targetKeyId,omitempty"`
}

// AwsEksNodeGroup models an EKS managed node group summary.
type AwsEksNodeGroup struct {
	NodeGroupArn  string   `json:"nodeGroupArn"`
	NodeGroupName string   `json:"nodeGroupName"`
	Status        string   `json:"status,omitempty"`
	InstanceTypes []string `json:"instanceTypes,omitempty"`
	DesiredSize   int32    `json:"desiredSize,omitempty"`
	MinSize       int32    `json:"minSize,omitempty"`
	MaxSize       int32    `json:"maxSize,omitempty"`
	DiskSize      int32    `json:"diskSize,omitempty"`
	AmiType       string   `json:"amiType,omitempty"`
	CapacityType  string   `json:"capacityType,omitempty"`
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
	FunctionName  string `json:"functionName"`
	Runtime       string `json:"runtime"`
	Handler       string `json:"handler,omitempty"`
	MemorySize    int32  `json:"memorySize,omitempty"`
	Timeout       int32  `json:"timeout,omitempty"`
	Description   string `json:"description,omitempty"`
	HandlerSource string `json:"handlerSource,omitempty"`
	ZipSourcePath string `json:"zipSourcePath,omitempty"`
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

// AzureBastionHost is a Bastion resource in the subscription (cloud only).
type AzureBastionHost struct {
	Name          string `json:"name"`
	ResourceGroup string `json:"resourceGroup"`
	Location      string `json:"location,omitempty"`
	SKU           string `json:"sku,omitempty"`
}

// AzureBastionConnectResult is returned when building or launching a native-client session.
type AzureBastionConnectResult struct {
	Command           string `json:"command"`
	PowerShellCommand string `json:"powershellCommand,omitempty"`
	Launched          bool   `json:"launched"`
	Protocol          string `json:"protocol,omitempty"`
}

type AzureStorageAccount struct {
	Name         string `json:"name"`
	Kind         string `json:"kind,omitempty"`
	Location     string `json:"location,omitempty"`
	BlobEndpoint string `json:"blobEndpoint,omitempty"`
	Summary      string `json:"summary,omitempty"`
}

type AzureBlobContainer struct {
	Name         string `json:"name"`
	LastModified string `json:"lastModified,omitempty"`
}

type AzureBlob struct {
	Name        string `json:"name"`
	Size        string `json:"size,omitempty"`
	ModifiedAt  string `json:"modifiedAt,omitempty"`
	ContentType string `json:"contentType,omitempty"`
}

type AzureBlobUploadResult struct {
	AccountName   string `json:"accountName"`
	ContainerName string `json:"containerName"`
	BlobName      string `json:"blobName"`
	BlobURL       string `json:"blobUrl"`
}

type AzureBlobCopyResult struct {
	AccountName         string `json:"accountName"`
	ContainerName       string `json:"containerName"`
	SourceBlobName      string `json:"sourceBlobName"`
	DestinationBlobName string `json:"destinationBlobName"`
	BlobURL             string `json:"blobUrl"`
}

type AzureBlobCreateFolderPrefixResult struct {
	AccountName   string `json:"accountName"`
	ContainerName string `json:"containerName"`
	FolderPrefix  string `json:"folderPrefix"`
}

// AzureBlobPresignResult is a short-lived read SAS URL for a selected blob.
type AzureBlobPresignResult struct {
	AccountName     string `json:"accountName"`
	ContainerName   string `json:"containerName"`
	BlobName        string `json:"blobName"`
	URL             string `json:"url"`
	DurationSeconds int    `json:"durationSeconds"`
	ExpiresAt       string `json:"expiresAt"`
}

type AzureWebApp struct {
	Name                        string `json:"name"`
	ResourceGroup               string `json:"resourceGroup,omitempty"`
	Location                    string `json:"location,omitempty"`
	State                       string `json:"state,omitempty"`
	DefaultHostName             string `json:"defaultHostName,omitempty"`
	Kind                        string `json:"kind,omitempty"`
	HTTPSOnly                   bool   `json:"httpsOnly,omitempty"`
	AppServicePlan              string `json:"appServicePlan,omitempty"`
	AppServicePlanResourceGroup string `json:"appServicePlanResourceGroup,omitempty"`
	PlanSKU                     string `json:"planSku,omitempty"`
	Runtime                     string `json:"runtime,omitempty"`
	OutboundIPs                 string `json:"outboundIpAddresses,omitempty"`
	IdentityType                string `json:"identityType,omitempty"`
	IdentityPrincipalID         string `json:"identityPrincipalId,omitempty"`
}

type AzureAppServicePlan struct {
	Name            string `json:"name"`
	ResourceGroup   string `json:"resourceGroup,omitempty"`
	Location        string `json:"location,omitempty"`
	SKU             string `json:"sku,omitempty"`
	Kind            string `json:"kind,omitempty"`
	Status          string `json:"status,omitempty"`
	NumberOfWorkers int    `json:"numberOfWorkers,omitempty"`
}

type AzureWebAppSetting struct {
	Name        string `json:"name"`
	Value       string `json:"value"`
	SlotSetting bool   `json:"slotSetting,omitempty"`
}

// AzureWebAppDeploymentSlot is a non-production deployment slot on a web app.
type AzureWebAppDeploymentSlot struct {
	Name            string `json:"name"`
	Status          string `json:"status,omitempty"`
	DefaultHostName string `json:"defaultHostName,omitempty"`
	TrafficPercent  int    `json:"trafficPercent,omitempty"`
}

// AzureLogAnalyticsWorkspace is a Log Analytics (Azure Monitor) workspace. CustomerID
// is the GUID the query data-plane keys on.
type AzureLogAnalyticsWorkspace struct {
	Name          string `json:"name"`
	ResourceGroup string `json:"resourceGroup,omitempty"`
	Location      string `json:"location,omitempty"`
	CustomerID    string `json:"customerId,omitempty"`
}

// AzureLogQueryResult is a normalised KQL result table (columns + string rows),
// the same shape whether it came from floci-az locally or real Azure Monitor.
type AzureLogQueryResult struct {
	Columns    []string   `json:"columns"`
	Rows       [][]string `json:"rows"`
	DurationMs int64      `json:"durationMs,omitempty"`
	Truncated  bool       `json:"truncated,omitempty"`
}

type AzureLogAnalyticsSelectionResult struct {
	Workspace string `json:"workspace"`
}

// AzureLogAnalyticsHistoryEntry is one successful query remembered locally.
type AzureLogAnalyticsHistoryEntry struct {
	Query    string `json:"query"`
	Timespan string `json:"timespan,omitempty"`
	RanAt    string `json:"ranAt"`
}

// AzureLogAnalyticsSavedQuery is a user-named query stored locally (cloud sync later).
type AzureLogAnalyticsSavedQuery struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Query    string `json:"query"`
	Timespan string `json:"timespan,omitempty"`
}

// AzureLogAnalyticsTableInfo describes a workspace table for the schema browser.
type AzureLogAnalyticsTableInfo struct {
	Name    string   `json:"name"`
	Columns []string `json:"columns,omitempty"`
}

// AzureWafLogColumnMap maps logical WAF fields to workspace-specific column names.
type AzureWafLogColumnMap struct {
	TimeGenerated     string `json:"timeGenerated"`
	Category          string `json:"category,omitempty"`
	Action            string `json:"action"`
	RuleName          string `json:"ruleName"`
	RequestUri        string `json:"requestUri"`
	ClientIP          string `json:"clientIP"`
	Host              string `json:"host"`
	PolicyName        string `json:"policyName"`
	PolicyMode        string `json:"policyMode"`
	TrackingReference string `json:"trackingReference"`
	DetailsMatches    string `json:"detailsMatches"`
	DetailsMessage    string `json:"detailsMessage"`
	DetailsData       string `json:"detailsData,omitempty"`
	AdditionalFields  string `json:"additionalFields,omitempty"`
}

// AzureWafLogSchemaProfile describes how WAF logs are stored in a workspace.
type AzureWafLogSchemaProfile struct {
	Mode       string               `json:"mode"` // azureDiagnostics | resourceSpecific
	TableName  string               `json:"tableName"`
	Categories []string             `json:"categories,omitempty"`
	Columns    AzureWafLogColumnMap `json:"columns"`
	Detected   bool                 `json:"detected"`
	Message    string               `json:"message,omitempty"`
}

// AzureWafPolicySummary is a Front Door WAF policy visible in the subscription.
type AzureWafPolicySummary struct {
	Name          string `json:"name"`
	ResourceGroup string `json:"resourceGroup"`
	Location      string `json:"location,omitempty"`
	SKU           string `json:"sku,omitempty"`
	Mode          string `json:"mode,omitempty"`
	Enabled       bool   `json:"enabled"`
}

// AzureWafManagedRuleGroup is a managed rule set group on a policy.
type AzureWafManagedRuleGroup struct {
	RuleSetType    string `json:"ruleSetType"`
	RuleSetVersion string `json:"ruleSetVersion"`
	RuleSetAction  string `json:"ruleSetAction,omitempty"`
	RuleGroupName  string `json:"ruleGroupName,omitempty"`
}

// AzureWafManagedRuleOverride is a per-rule override on a managed rule set.
type AzureWafManagedRuleOverride struct {
	RuleID        string `json:"ruleId"`
	RuleGroupName string `json:"ruleGroupName,omitempty"`
	Enabled       bool   `json:"enabled"`
	Action        string `json:"action,omitempty"`
}

// AzureWafExclusion is a managed-rule exclusion on a policy.
type AzureWafExclusion struct {
	// RuleSetType is the managed rule set the exclusion is scoped to. The az CLI
	// exclusion add/remove commands require it (--type).
	RuleSetType           string `json:"ruleSetType,omitempty"`
	MatchVariable         string `json:"matchVariable"`
	SelectorMatchOperator string `json:"selectorMatchOperator"`
	Selector              string `json:"selector,omitempty"`
}

// AzureWafCustomRule is a custom rule on a WAF policy.
type AzureWafCustomRule struct {
	Name     string `json:"name"`
	Priority int    `json:"priority"`
	RuleType string `json:"ruleType"`
	Action   string `json:"action"`
	Enabled  bool   `json:"enabled"`
}

// AzureWafPolicyDetail is the full read-only config for a selected policy.
type AzureWafPolicyDetail struct {
	Name                  string                        `json:"name"`
	ResourceGroup         string                        `json:"resourceGroup"`
	Location              string                        `json:"location,omitempty"`
	SKU                   string                        `json:"sku,omitempty"`
	Mode                  string                        `json:"mode"`
	Enabled               bool                          `json:"enabled"`
	RequestBodyCheck      string                        `json:"requestBodyCheck,omitempty"`
	ManagedRuleSets       []AzureWafManagedRuleGroup    `json:"managedRuleSets"`
	ManagedRuleOverrides  []AzureWafManagedRuleOverride `json:"managedRuleOverrides"`
	Exclusions            []AzureWafExclusion           `json:"exclusions"`
	CustomRules           []AzureWafCustomRule          `json:"customRules"`
	RedirectURL           string                        `json:"redirectUrl,omitempty"`
	CustomBlockStatusCode int                           `json:"customBlockStatusCode,omitempty"`
}

// AzureWafRuleFireCount correlates a managed rule with recent log volume.
type AzureWafRuleFireCount struct {
	RuleName string `json:"ruleName"`
	Count    int    `json:"count"`
	Action   string `json:"action,omitempty"`
}

// AzureFrontDoorProfile is an Azure Front Door Standard or Premium profile.
type AzureFrontDoorProfile struct {
	Name                   string `json:"name"`
	ResourceGroup          string `json:"resourceGroup,omitempty"`
	Location               string `json:"location,omitempty"`
	SKU                    string `json:"sku,omitempty"`
	WafPolicyName          string `json:"wafPolicyName,omitempty"`
	WafPolicyResourceGroup string `json:"wafPolicyResourceGroup,omitempty"`
}

// AzureFrontDoorEndpoint is an endpoint within a Front Door profile.
type AzureFrontDoorEndpoint struct {
	Name          string `json:"name"`
	ProfileName   string `json:"profileName,omitempty"`
	ResourceGroup string `json:"resourceGroup,omitempty"`
	HostName      string `json:"hostName,omitempty"`
	EnabledState  string `json:"enabledState,omitempty"`
}

// AzureFrontDoorOriginGroup is an origin group within a Front Door profile.
type AzureFrontDoorOriginGroup struct {
	Name          string `json:"name"`
	ProfileName   string `json:"profileName,omitempty"`
	ResourceGroup string `json:"resourceGroup,omitempty"`
	HealthProbe   string `json:"healthProbe,omitempty"`
	LoadBalancing string `json:"loadBalancing,omitempty"`
}

// AzureFrontDoorOrigin is an origin within an origin group.
type AzureFrontDoorOrigin struct {
	Name            string `json:"name"`
	OriginGroupName string `json:"originGroupName,omitempty"`
	ProfileName     string `json:"profileName,omitempty"`
	ResourceGroup   string `json:"resourceGroup,omitempty"`
	HostName        string `json:"hostName,omitempty"`
	EnabledState    string `json:"enabledState,omitempty"`
	Priority        int    `json:"priority,omitempty"`
	Weight          int    `json:"weight,omitempty"`
}

// AzureFunctionApp is a Function App (Microsoft.Web/sites, kind functionapp).
type AzureFunctionApp struct {
	Name            string `json:"name"`
	ResourceGroup   string `json:"resourceGroup,omitempty"`
	Location        string `json:"location,omitempty"`
	State           string `json:"state,omitempty"`
	DefaultHostName string `json:"defaultHostName,omitempty"`
	Runtime         string `json:"runtime,omitempty"`
}

// AzureFunction is a single function within a Function App.
type AzureFunction struct {
	Name     string `json:"name"`
	Trigger  string `json:"trigger,omitempty"`
	Language string `json:"language,omitempty"`
}

// AzureFunctionInvokeResult is the response from invoking an HTTP-triggered function.
type AzureFunctionInvokeResult struct {
	StatusCode int    `json:"statusCode"`
	Body       string `json:"body"`
}

// AzureKeyVault is a Key Vault (Microsoft.KeyVault/vaults).
type AzureKeyVault struct {
	Name          string `json:"name"`
	ResourceGroup string `json:"resourceGroup,omitempty"`
	Location      string `json:"location,omitempty"`
	VaultURI      string `json:"vaultUri,omitempty"`
}

// AzureKeyVaultSecret is a secret's metadata (never its value; the value is only
// fetched on an explicit reveal).
type AzureKeyVaultSecret struct {
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
	Updated string `json:"updated,omitempty"`
}

// AzureCosmosAccount is a Cosmos DB account.
type AzureCosmosAccount struct {
	Name             string `json:"name"`
	ResourceGroup    string `json:"resourceGroup,omitempty"`
	DocumentEndpoint string `json:"documentEndpoint,omitempty"`
}

// AzureCosmosDatabase is a SQL-API database within an account.
type AzureCosmosDatabase struct {
	Name string `json:"name"`
}

// AzureCosmosContainer is a container (collection) within a database.
type AzureCosmosContainer struct {
	Name         string `json:"name"`
	PartitionKey string `json:"partitionKey,omitempty"`
}

// AzureCosmosItem is a sampled document: its id plus the raw JSON.
type AzureCosmosItem struct {
	ID   string `json:"id"`
	JSON string `json:"json"`
}

// AzurePostgresServer is a PostgreSQL Flexible Server.
type AzurePostgresServer struct {
	Name               string        `json:"name"`
	ResourceGroup      string        `json:"resourceGroup,omitempty"`
	Location           string        `json:"location"`
	Version            string        `json:"version"`
	AdministratorLogin string        `json:"administratorLogin"`
	SKU                string        `json:"sku"`
	StorageMB          int           `json:"storageMb"`
	ProvisioningState  string        `json:"provisioningState"`
	FQDN               string        `json:"fqdn"`
	LocalHost          string        `json:"localHost,omitempty"`
	LocalPort          int           `json:"localPort,omitempty"`
	Tags               []DetailField `json:"tags,omitempty"`
}

// AzurePostgresConnection holds ready-to-paste connection strings.
type AzurePostgresConnection struct {
	Host    string `json:"host"`
	Port    int    `json:"port"`
	JDBCUrl string `json:"jdbcUrl"`
	URI     string `json:"uri"`
	Psql    string `json:"psql"`
	DotNet  string `json:"dotNet"`
	Note    string `json:"note,omitempty"`
}

// AzurePostgresLifecycleResult reports a start/stop action on a flexible server.
type AzurePostgresLifecycleResult struct {
	ServerName    string `json:"serverName"`
	ResourceGroup string `json:"resourceGroup"`
	Action        string `json:"action"`
	Summary       string `json:"summary"`
}

// AzureStorageQueue is a queue within a storage account.
type AzureStorageQueue struct {
	Name string `json:"name"`
}

// AzureQueueMessage is a peeked queue message (read without consuming).
type AzureQueueMessage struct {
	ID            string `json:"id"`
	Text          string `json:"text"`
	DequeueCount  int64  `json:"dequeueCount"`
	InsertionTime string `json:"insertionTime,omitempty"`
}

// AzureQueuePurgeResult reports a successful clear of all messages in a queue.
type AzureQueuePurgeResult struct {
	AccountName string `json:"accountName"`
	QueueName   string `json:"queueName"`
	Summary     string `json:"summary"`
}

// AzureEntraUser is a directory user (Microsoft Entra ID / Azure AD).
type AzureEntraUser struct {
	DisplayName       string `json:"displayName"`
	UserPrincipalName string `json:"userPrincipalName,omitempty"`
	ID                string `json:"id,omitempty"`
}

// AzureEntraGroup is a directory group.
type AzureEntraGroup struct {
	DisplayName string `json:"displayName"`
	ID          string `json:"id,omitempty"`
}

// AzureEntraApp is an app registration.
type AzureEntraApp struct {
	DisplayName string `json:"displayName"`
	AppID       string `json:"appId,omitempty"`
}

// RuntimeSnapshot carries Local Runtime tab state without a full workspace rebuild.
type RuntimeSnapshot struct {
	DockerRuntime     DockerRuntimeSnapshot   `json:"dockerRuntime"`
	DockerResources   []ManagedDockerResource `json:"dockerResources"`
	EmulatorSummaries []EmulatorSummary       `json:"emulatorSummaries"`
	DockerDiagnostics DockerDiagnostics       `json:"dockerDiagnostics"`
}

type WorkspaceSnapshot struct {
	Provider               *ProviderSummary              `json:"provider,omitempty"`
	Profile                *ProfileSummary               `json:"profile,omitempty"`
	AuthMethod             AuthMethod                    `json:"authMethod,omitempty"`
	RuntimeSettings        AppSettingsSnapshot           `json:"runtimeSettings"`
	EnvironmentDiagnostics []DetailField                 `json:"environmentDiagnostics"`
	DockerDiagnostics      DockerDiagnostics             `json:"dockerDiagnostics"`
	DockerRuntime          DockerRuntimeSnapshot         `json:"dockerRuntime"`
	DockerResources        []ManagedDockerResource       `json:"dockerResources"`
	EmulatorSummaries      []EmulatorSummary             `json:"emulatorSummaries"`
	LocalConfigArtifacts   []LocalConfigArtifact         `json:"localConfigArtifacts"`
	AWSEndpointURL         string                        `json:"awsEndpointUrl,omitempty"`
	AWSWriteCapable        bool                          `json:"awsWriteCapable"`
	AWSWriteTargetIsLocal  bool                          `json:"awsWriteTargetIsLocal"`
	AWSWriteModeEnabled    bool                          `json:"awsWriteModeEnabled"`
	AWSWritesEnabled       bool                          `json:"awsWritesEnabled"`
	ActionCapabilities     map[string][]ActionCapability `json:"actionCapabilities,omitempty"`
	SelectedS3BucketName   string                        `json:"selectedS3BucketName,omitempty"`
	SelectedS3ObjectKey    string                        `json:"selectedS3ObjectKey,omitempty"`
	S3PrefixFilter         string                        `json:"s3PrefixFilter,omitempty"`
	S3StatusMessage        string                        `json:"s3StatusMessage,omitempty"`
	S3Buckets              []AwsS3Bucket                 `json:"s3Buckets"`
	S3Objects              []AwsS3Object                 `json:"s3Objects"`
	// S3ObjectsNextToken is the ListObjectsV2 continuation token for Load more.
	S3ObjectsNextToken string `json:"s3ObjectsNextToken,omitempty"`
	// S3ObjectsHasMore is true when another page is available under the current prefix.
	S3ObjectsHasMore                  bool                          `json:"s3ObjectsHasMore,omitempty"`
	S3ObjectMetadata                  []DetailField                 `json:"s3ObjectMetadata"`
	S3ExportSnippets                  []AwsS3ExportSnippet          `json:"s3ExportSnippets"`
	SelectedEC2Region                 string                        `json:"selectedEc2Region,omitempty"`
	SelectedEC2InstanceID             string                        `json:"selectedEc2InstanceId,omitempty"`
	EC2StatusMessage                  string                        `json:"ec2StatusMessage,omitempty"`
	EC2Regions                        []string                      `json:"ec2Regions"`
	EC2Instances                      []AwsEc2Instance              `json:"ec2Instances"`
	SelectedLambdaRegion              string                        `json:"selectedLambdaRegion,omitempty"`
	SelectedLambdaFunctionName        string                        `json:"selectedLambdaFunctionName,omitempty"`
	LambdaStatusMessage               string                        `json:"lambdaStatusMessage,omitempty"`
	LambdaRegions                     []string                      `json:"lambdaRegions"`
	LambdaFunctions                   []AwsLambdaFunction           `json:"lambdaFunctions"`
	SelectedDynamoDBRegion            string                        `json:"selectedDynamodbRegion,omitempty"`
	SelectedDynamoDBTableName         string                        `json:"selectedDynamodbTableName,omitempty"`
	DynamoDBStatusMessage             string                        `json:"dynamodbStatusMessage,omitempty"`
	DynamoDBRegions                   []string                      `json:"dynamodbRegions"`
	DynamoDBTables                    []AwsDynamoDBTable            `json:"dynamodbTables"`
	SelectedSQSRegion                 string                        `json:"selectedSqsRegion,omitempty"`
	SelectedSQSQueueURL               string                        `json:"selectedSqsQueueUrl,omitempty"`
	SQSStatusMessage                  string                        `json:"sqsStatusMessage,omitempty"`
	SQSRegions                        []string                      `json:"sqsRegions"`
	SQSQueues                         []AwsSqsQueue                 `json:"sqsQueues"`
	SelectedSNSRegion                 string                        `json:"selectedSnsRegion,omitempty"`
	SelectedSNSTopicArn               string                        `json:"selectedSnsTopicArn,omitempty"`
	SNSStatusMessage                  string                        `json:"snsStatusMessage,omitempty"`
	SNSRegions                        []string                      `json:"snsRegions"`
	SNSTopics                         []AwsSnsTopic                 `json:"snsTopics"`
	SelectedRDSRegion                 string                        `json:"selectedRdsRegion,omitempty"`
	SelectedRDSInstanceID             string                        `json:"selectedRdsInstanceId,omitempty"`
	RDSStatusMessage                  string                        `json:"rdsStatusMessage,omitempty"`
	RDSRegions                        []string                      `json:"rdsRegions"`
	RDSInstances                      []AwsRdsInstance              `json:"rdsInstances"`
	SelectedECSRegion                 string                        `json:"selectedEcsRegion,omitempty"`
	SelectedECSClusterArn             string                        `json:"selectedEcsClusterArn,omitempty"`
	SelectedECSServiceArn             string                        `json:"selectedEcsServiceArn,omitempty"`
	SelectedECSTaskArn                string                        `json:"selectedEcsTaskArn,omitempty"`
	ECSStatusMessage                  string                        `json:"ecsStatusMessage,omitempty"`
	ECSRegions                        []string                      `json:"ecsRegions"`
	ECSClusters                       []AwsEcsCluster               `json:"ecsClusters"`
	ECSServices                       []AwsEcsService               `json:"ecsServices"`
	ECSTasks                          []AwsEcsTask                  `json:"ecsTasks"`
	SelectedEKSRegion                 string                        `json:"selectedEksRegion,omitempty"`
	SelectedEKSClusterName            string                        `json:"selectedEksClusterName,omitempty"`
	EKSStatusMessage                  string                        `json:"eksStatusMessage,omitempty"`
	EKSRegions                        []string                      `json:"eksRegions"`
	EKSClusters                       []AwsEksCluster               `json:"eksClusters"`
	EKSNodeGroups                     []AwsEksNodeGroup             `json:"eksNodeGroups"`
	SelectedCloudFormationRegion      string                        `json:"selectedCloudFormationRegion,omitempty"`
	SelectedCloudFormationStackName   string                        `json:"selectedCloudFormationStackName,omitempty"`
	CloudFormationStatusMessage       string                        `json:"cloudFormationStatusMessage,omitempty"`
	CloudFormationRegions             []string                      `json:"cloudFormationRegions"`
	CloudFormationStacks              []AwsCloudFormationStack      `json:"cloudFormationStacks"`
	CloudFormationStackEvents         []AwsCloudFormationStackEvent `json:"cloudFormationStackEvents"`
	SelectedEventBridgeRegion         string                        `json:"selectedEventBridgeRegion,omitempty"`
	SelectedEventBridgeBusName        string                        `json:"selectedEventBridgeBusName,omitempty"`
	EventBridgeStatusMessage          string                        `json:"eventBridgeStatusMessage,omitempty"`
	EventBridgeRegions                []string                      `json:"eventBridgeRegions"`
	EventBridgeBuses                  []AwsEventBridgeBus           `json:"eventBridgeBuses"`
	EventBridgeRules                  []AwsEventBridgeRule          `json:"eventBridgeRules"`
	SelectedRoute53HostedZoneID       string                        `json:"selectedRoute53HostedZoneId,omitempty"`
	Route53StatusMessage              string                        `json:"route53StatusMessage,omitempty"`
	Route53HostedZones                []AwsRoute53HostedZone        `json:"route53HostedZones"`
	Route53ResourceRecordSets         []AwsRoute53ResourceRecordSet `json:"route53ResourceRecordSets"`
	SelectedElbRegion                 string                        `json:"selectedElbRegion,omitempty"`
	SelectedElbLoadBalancerArn        string                        `json:"selectedElbLoadBalancerArn,omitempty"`
	ElbStatusMessage                  string                        `json:"elbStatusMessage,omitempty"`
	ElbRegions                        []string                      `json:"elbRegions"`
	ElbLoadBalancers                  []AwsElbLoadBalancer          `json:"elbLoadBalancers"`
	ElbTargetGroups                   []AwsElbTargetGroup           `json:"elbTargetGroups"`
	SelectedKmsRegion                 string                        `json:"selectedKmsRegion,omitempty"`
	SelectedKmsKeyId                  string                        `json:"selectedKmsKeyId,omitempty"`
	KmsStatusMessage                  string                        `json:"kmsStatusMessage,omitempty"`
	KmsRegions                        []string                      `json:"kmsRegions"`
	KmsKeys                           []AwsKmsKey                   `json:"kmsKeys"`
	KmsAliases                        []AwsKmsAlias                 `json:"kmsAliases"`
	SelectedApiGatewayRegion          string                        `json:"selectedApiGatewayRegion,omitempty"`
	SelectedApiGatewayApiKey          string                        `json:"selectedApiGatewayApiKey,omitempty"`
	ApiGatewayStatusMessage           string                        `json:"apiGatewayStatusMessage,omitempty"`
	ApiGatewayRegions                 []string                      `json:"apiGatewayRegions"`
	ApiGatewayApis                    []AwsApiGatewayApi            `json:"apiGatewayApis"`
	ApiGatewayStages                  []AwsApiGatewayStage          `json:"apiGatewayStages"`
	SelectedSecretsManagerRegion      string                        `json:"selectedSecretsManagerRegion,omitempty"`
	SelectedSecretsManagerName        string                        `json:"selectedSecretsManagerName,omitempty"`
	SecretsManagerStatusMessage       string                        `json:"secretsManagerStatusMessage,omitempty"`
	SecretsManagerRegions             []string                      `json:"secretsManagerRegions"`
	SecretsManagerSecrets             []AwsSecretsManagerSecret     `json:"secretsManagerSecrets"`
	SelectedLogsRegion                string                        `json:"selectedLogsRegion,omitempty"`
	SelectedLogGroupName              string                        `json:"selectedLogGroupName,omitempty"`
	LogsStatusMessage                 string                        `json:"logsStatusMessage,omitempty"`
	LogsRegions                       []string                      `json:"logsRegions"`
	LogGroups                         []AwsLogGroup                 `json:"logGroups"`
	SelectedIAMRoleName               string                        `json:"selectedIamRoleName,omitempty"`
	IAMStatusMessage                  string                        `json:"iamStatusMessage,omitempty"`
	IAMRoles                          []AwsIamRole                  `json:"iamRoles"`
	IAMPolicies                       []AwsIamPolicy                `json:"iamPolicies"`
	AzureEndpointURL                  string                        `json:"azureEndpointUrl,omitempty"`
	AzureCLIExtensions                []AzureCLIExtensionStatus     `json:"azureCliExtensions,omitempty"`
	AzureWriteCapable                 bool                          `json:"azureWriteCapable"`
	AzureWriteModeEnabled             bool                          `json:"azureWriteModeEnabled"`
	AzureWritesEnabled                bool                          `json:"azureWritesEnabled"`
	SelectedAzureResourceGroup        string                        `json:"selectedAzureResourceGroup,omitempty"`
	SelectedAzureVMID                 string                        `json:"selectedAzureVmId,omitempty"`
	SelectedAzureStorageAccount       string                        `json:"selectedAzureStorageAccount,omitempty"`
	SelectedAzureBlobContainer        string                        `json:"selectedAzureBlobContainer,omitempty"`
	SelectedAzureBlobName             string                        `json:"selectedAzureBlobName,omitempty"`
	AzureBlobPrefixFilter             string                        `json:"azureBlobPrefixFilter,omitempty"`
	SelectedAzureWebAppName           string                        `json:"selectedAzureWebAppName,omitempty"`
	SelectedAzureWebAppSlot           string                        `json:"selectedAzureWebAppSlot,omitempty"`
	SelectedAzureLogWorkspace         string                        `json:"selectedAzureLogWorkspace,omitempty"`
	SelectedAzureWafPolicy            string                        `json:"selectedAzureWafPolicy,omitempty"`
	SelectedAzureFunctionApp          string                        `json:"selectedAzureFunctionApp,omitempty"`
	SelectedAzureFunction             string                        `json:"selectedAzureFunction,omitempty"`
	AzureStatusMessage                string                        `json:"azureStatusMessage,omitempty"`
	AzureStorageStatusMessage         string                        `json:"azureStorageStatusMessage,omitempty"`
	AzureAppServiceStatusMessage      string                        `json:"azureAppServiceStatusMessage,omitempty"`
	AzureLogAnalyticsStatusMessage    string                        `json:"azureLogAnalyticsStatusMessage,omitempty"`
	AzureFunctionsStatusMessage       string                        `json:"azureFunctionsStatusMessage,omitempty"`
	AzureKeyVaultStatusMessage        string                        `json:"azureKeyVaultStatusMessage,omitempty"`
	AzureCosmosStatusMessage          string                        `json:"azureCosmosStatusMessage,omitempty"`
	AzurePostgresStatusMessage        string                        `json:"azurePostgresStatusMessage,omitempty"`
	AzureQueuesStatusMessage          string                        `json:"azureQueuesStatusMessage,omitempty"`
	SelectedAzureQueue                string                        `json:"selectedAzureQueue,omitempty"`
	SelectedAzureKeyVault             string                        `json:"selectedAzureKeyVault,omitempty"`
	SelectedAzureSecret               string                        `json:"selectedAzureSecret,omitempty"`
	SelectedAzureCosmosAccount        string                        `json:"selectedAzureCosmosAccount,omitempty"`
	SelectedAzureCosmosDatabase       string                        `json:"selectedAzureCosmosDatabase,omitempty"`
	SelectedAzureCosmosContainer      string                        `json:"selectedAzureCosmosContainer,omitempty"`
	SelectedAzurePostgresServer       string                        `json:"selectedAzurePostgresServer,omitempty"`
	SelectedAzureFrontDoorProfile     string                        `json:"selectedAzureFrontDoorProfile,omitempty"`
	SelectedAzureFrontDoorEndpoint    string                        `json:"selectedAzureFrontDoorEndpoint,omitempty"`
	SelectedAzureFrontDoorOriginGroup string                        `json:"selectedAzureFrontDoorOriginGroup,omitempty"`
	AzureFrontDoorStatusMessage       string                        `json:"azureFrontDoorStatusMessage,omitempty"`
	AzureFrontDoorProfiles            []AzureFrontDoorProfile       `json:"azureFrontDoorProfiles"`
	AzureFrontDoorEndpoints           []AzureFrontDoorEndpoint      `json:"azureFrontDoorEndpoints"`
	AzureFrontDoorOriginGroups        []AzureFrontDoorOriginGroup   `json:"azureFrontDoorOriginGroups"`
	AzureFrontDoorOrigins             []AzureFrontDoorOrigin        `json:"azureFrontDoorOrigins"`
	AzureResourceGroups               []AzureResourceGroup          `json:"azureResourceGroups"`
	AzureVirtualMachines              []AzureVirtualMachine         `json:"azureVirtualMachines"`
	AzureStorageAccounts              []AzureStorageAccount         `json:"azureStorageAccounts"`
	AzureBlobContainers               []AzureBlobContainer          `json:"azureBlobContainers"`
	AzureBlobs                        []AzureBlob                   `json:"azureBlobs"`
	AzureBlobMetadata                 []DetailField                 `json:"azureBlobMetadata"`
	AzureWebApps                      []AzureWebApp                 `json:"azureWebApps"`
	AzureAppServicePlans              []AzureAppServicePlan         `json:"azureAppServicePlans"`
	AzureWebAppSettings               []AzureWebAppSetting          `json:"azureWebAppSettings"`
	AzureWebAppDeploymentSlots        []AzureWebAppDeploymentSlot   `json:"azureWebAppDeploymentSlots"`
	AzureWebAppActiveDetail           *AzureWebApp                  `json:"azureWebAppActiveDetail,omitempty"`
	AzureLogAnalyticsWorkspaces       []AzureLogAnalyticsWorkspace  `json:"azureLogAnalyticsWorkspaces"`
	AzureWafLogSchema                 *AzureWafLogSchemaProfile     `json:"azureWafLogSchema,omitempty"`
	AzureWafStatusMessage             string                        `json:"azureWafStatusMessage,omitempty"`
	AzureWafPolicies                  []AzureWafPolicySummary       `json:"azureWafPolicies"`
	AzureWafPolicyDetail              *AzureWafPolicyDetail         `json:"azureWafPolicyDetail,omitempty"`
	AzureWafRuleFireCounts            []AzureWafRuleFireCount       `json:"azureWafRuleFireCounts"`
	AzureFunctionApps                 []AzureFunctionApp            `json:"azureFunctionApps"`
	AzureFunctions                    []AzureFunction               `json:"azureFunctions"`
	AzureKeyVaults                    []AzureKeyVault               `json:"azureKeyVaults"`
	AzureKeyVaultSecrets              []AzureKeyVaultSecret         `json:"azureKeyVaultSecrets"`
	AzureCosmosAccounts               []AzureCosmosAccount          `json:"azureCosmosAccounts"`
	AzureCosmosDatabases              []AzureCosmosDatabase         `json:"azureCosmosDatabases"`
	AzureCosmosContainers             []AzureCosmosContainer        `json:"azureCosmosContainers"`
	AzureCosmosItems                  []AzureCosmosItem             `json:"azureCosmosItems"`
	AzurePostgresServers              []AzurePostgresServer         `json:"azurePostgresServers"`
	AzurePostgresConnection           *AzurePostgresConnection      `json:"azurePostgresConnection,omitempty"`
	AzureStorageQueues                []AzureStorageQueue           `json:"azureStorageQueues"`
	AzureQueueMessages                []AzureQueueMessage           `json:"azureQueueMessages"`
	AzureEntraStatusMessage           string                        `json:"azureEntraStatusMessage,omitempty"`
	AzureEntraUsers                   []AzureEntraUser              `json:"azureEntraUsers"`
	AzureEntraGroups                  []AzureEntraGroup             `json:"azureEntraGroups"`
	AzureEntraApps                    []AzureEntraApp               `json:"azureEntraApps"`
	// GCP Cloud Storage inventory (bucket list + object browser).
	SelectedGcpStorageBucket string             `json:"selectedGcpStorageBucket,omitempty"`
	GcpStoragePrefixFilter   string             `json:"gcpStoragePrefixFilter,omitempty"`
	GcpStorageStatusMessage  string             `json:"gcpStorageStatusMessage,omitempty"`
	GcpStorageBuckets        []GcpStorageBucket `json:"gcpStorageBuckets"`
	GcpStorageObjects        []GcpStorageObject `json:"gcpStorageObjects"`
	// GcpStorageObjectsNextToken is the gcloud page token for Load more.
	GcpStorageObjectsNextToken string `json:"gcpStorageObjectsNextToken,omitempty"`
	// GcpStorageObjectsHasMore is true when another page is available under the current prefix.
	GcpStorageObjectsHasMore bool `json:"gcpStorageObjectsHasMore,omitempty"`
	// GCP write mode (mirrors AWS/Azure per-provider session flags).
	GcpWriteCapable     bool `json:"gcpWriteCapable"`
	GcpWriteModeEnabled bool `json:"gcpWriteModeEnabled"`
	GcpWritesEnabled    bool `json:"gcpWritesEnabled"`
	// GCP Compute Engine inventory (foundation slice).
	SelectedGcpComputeInstance string               `json:"selectedGcpComputeInstance,omitempty"`
	GcpComputeStatusMessage    string               `json:"gcpComputeStatusMessage,omitempty"`
	GcpComputeInstances        []GcpComputeInstance `json:"gcpComputeInstances"`
	// GCP Cloud Functions inventory (foundation slice).
	SelectedGcpFunction       string             `json:"selectedGcpFunction,omitempty"`
	GcpFunctionsStatusMessage string             `json:"gcpFunctionsStatusMessage,omitempty"`
	GcpFunctions              []GcpCloudFunction `json:"gcpFunctions"`
	// GCP GKE inventory (foundation slice).
	SelectedGcpGkeCluster string          `json:"selectedGcpGkeCluster,omitempty"`
	GcpGkeStatusMessage   string          `json:"gcpGkeStatusMessage,omitempty"`
	GcpGkeClusters        []GcpGkeCluster `json:"gcpGkeClusters"`
}

// GcpStorageBucket is a Cloud Storage bucket from gcloud inventory.
type GcpStorageBucket struct {
	Name         string `json:"name"`
	Location     string `json:"location,omitempty"`
	LocationType string `json:"locationType,omitempty"`
	StorageClass string `json:"storageClass,omitempty"`
	CreatedAt    string `json:"createdAt,omitempty"`
	Summary      string `json:"summary,omitempty"`
}

// GcpStorageObject is a Cloud Storage object or virtual folder under a prefix.
type GcpStorageObject struct {
	Key         string `json:"key"`
	Size        string `json:"size,omitempty"`
	Updated     string `json:"updated,omitempty"`
	ContentType string `json:"contentType,omitempty"`
	// IsFolder marks a virtual folder (prefix) from delimiter-style listing.
	IsFolder bool `json:"isFolder,omitempty"`
}

// GcpStorageObjectListPage is one delimiter-scoped page of folders and objects.
type GcpStorageObjectListPage struct {
	Entries       []GcpStorageObject `json:"entries"`
	NextPageToken string             `json:"nextPageToken,omitempty"`
	IsTruncated   bool               `json:"isTruncated,omitempty"`
}

// GcpStorageUploadResult is returned after a successful object upload.
type GcpStorageUploadResult struct {
	BucketName     string `json:"bucketName"`
	ObjectKey      string `json:"objectKey"`
	DestinationURI string `json:"destinationUri"`
}

// GcpComputeInstance is a Compute Engine VM from gcloud inventory.
type GcpComputeInstance struct {
	Name        string `json:"name"`
	Zone        string `json:"zone,omitempty"`
	MachineType string `json:"machineType,omitempty"`
	Status      string `json:"status,omitempty"`
	InternalIP  string `json:"internalIp,omitempty"`
	ExternalIP  string `json:"externalIp,omitempty"`
	CreatedAt   string `json:"createdAt,omitempty"`
	Summary     string `json:"summary,omitempty"`
}

// GcpCloudFunction is a Cloud Functions (1st or 2nd gen) entry from gcloud inventory.
type GcpCloudFunction struct {
	Name    string `json:"name"`
	Region  string `json:"region,omitempty"`
	Runtime string `json:"runtime,omitempty"`
	Status  string `json:"status,omitempty"`
	// Generation is "1st gen" or "2nd gen" when known.
	Generation string `json:"generation,omitempty"`
	Trigger    string `json:"trigger,omitempty"`
	URL        string `json:"url,omitempty"`
	UpdatedAt  string `json:"updatedAt,omitempty"`
	Summary    string `json:"summary,omitempty"`
}

// GcpGkeCluster is a Google Kubernetes Engine cluster from gcloud inventory.
type GcpGkeCluster struct {
	Name          string `json:"name"`
	Location      string `json:"location,omitempty"`
	Status        string `json:"status,omitempty"`
	MasterVersion string `json:"masterVersion,omitempty"`
	NodeCount     int    `json:"nodeCount,omitempty"`
	Endpoint      string `json:"endpoint,omitempty"`
	// Mode is "Autopilot" or "Standard" when known.
	Mode      string `json:"mode,omitempty"`
	CreatedAt string `json:"createdAt,omitempty"`
	Summary   string `json:"summary,omitempty"`
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
