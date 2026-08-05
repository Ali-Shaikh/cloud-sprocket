// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"

	appdeployment "cloudsprocket/backend/daemon/internal/app/deployment"
	appruntime "cloudsprocket/backend/daemon/internal/app/runtime"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/rpcapi"
)

type S3Inventory interface {
	ListBuckets(ctx context.Context, profile models.ProfileSummary) ([]models.AwsS3Bucket, error)
	// ListObjects returns one delimiter-scoped page (folders + objects) for the browser.
	// continuationToken empty means the first page under prefix.
	ListObjects(ctx context.Context, profile models.ProfileSummary, bucketName string, prefix string, continuationToken string) (models.AwsS3ObjectListPage, error)
	HeadObject(ctx context.Context, profile models.ProfileSummary, bucketName string, objectKey string) ([]models.DetailField, error)
	// GetObject returns the object body as a string (capped for lab checks).
	GetObject(ctx context.Context, profile models.ProfileSummary, bucketName string, objectKey string) (string, error)
	UploadFile(ctx context.Context, profile models.ProfileSummary, bucketName string, objectKey string, sourcePath string) (models.AwsS3UploadResult, error)
	PresignGetObject(ctx context.Context, profile models.ProfileSummary, bucketName string, objectKey string, durationSeconds int) (models.AwsS3PresignResult, error)
	DeleteObject(ctx context.Context, profile models.ProfileSummary, bucketName string, objectKey string) (models.AwsS3DeleteObjectResult, error)
	CreateBucket(ctx context.Context, profile models.ProfileSummary, bucketName string, region string) (models.AwsS3CreateBucketResult, error)
	CopyObject(ctx context.Context, profile models.ProfileSummary, bucketName string, sourceObjectKey string, destinationObjectKey string) (models.AwsS3CopyObjectResult, error)
	CreateFolderPrefix(ctx context.Context, profile models.ProfileSummary, bucketName string, folderPrefix string) (models.AwsS3CreateFolderPrefixResult, error)
}

type EC2Inventory interface {
	ListRegions(ctx context.Context, profile models.ProfileSummary) ([]string, error)
	ListInstances(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsEc2Instance, error)
	StartInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error
	StopInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error
	RebootInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error
	RunInstances(ctx context.Context, profile models.ProfileSummary, region string, instanceType string) (models.AwsEc2RunInstancesResult, error)
	TerminateInstances(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error
}

type LambdaInventory interface {
	ListFunctions(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsLambdaFunction, error)
	DescribeFunction(ctx context.Context, profile models.ProfileSummary, region string, functionName string) (models.AwsLambdaFunction, error)
	InvokeFunction(ctx context.Context, profile models.ProfileSummary, region string, functionName string, payload []byte) (models.AwsLambdaInvokeResult, error)
	CreateFunction(ctx context.Context, profile models.ProfileSummary, region string, input models.AwsLambdaCreateInput) (models.AwsLambdaFunction, error)
	DeleteFunction(ctx context.Context, profile models.ProfileSummary, region string, functionName string) (models.AwsLambdaDeleteFunctionResult, error)
}

type DynamoDBInventory interface {
	ListTables(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsDynamoDBTable, error)
	DescribeTable(ctx context.Context, profile models.ProfileSummary, region string, tableName string) (models.AwsDynamoDBTable, error)
	// GetItem loads one item by key JSON object. found is false when the key misses.
	GetItem(ctx context.Context, profile models.ProfileSummary, region string, tableName string, keyJSON string) (item map[string]any, found bool, err error)
	PutItem(ctx context.Context, profile models.ProfileSummary, region string, tableName string, itemJSON string) (models.AwsDynamoDBWriteResult, error)
	DeleteItem(ctx context.Context, profile models.ProfileSummary, region string, tableName string, keyJSON string) (models.AwsDynamoDBWriteResult, error)
}

type SQSInventory interface {
	ListQueues(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsSqsQueue, error)
	DescribeQueue(ctx context.Context, profile models.ProfileSummary, region string, queueURL string) (models.AwsSqsQueue, error)
	PeekMessages(ctx context.Context, profile models.ProfileSummary, region string, queueURL string) (models.AwsSqsPeekResult, error)
	SendMessage(ctx context.Context, profile models.ProfileSummary, region string, queueURL string, messageBody string) (models.AwsSqsSendResult, error)
	CreateQueue(ctx context.Context, profile models.ProfileSummary, region string, queueName string) (models.AwsSqsCreateQueueResult, error)
}

type SNSInventory interface {
	ListTopics(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsSnsTopic, error)
	DescribeTopic(ctx context.Context, profile models.ProfileSummary, region string, topicArn string) (models.AwsSnsTopic, error)
	Publish(ctx context.Context, profile models.ProfileSummary, region string, topicArn string, message string) (models.AwsSnsPublishResult, error)
	CreateTopic(ctx context.Context, profile models.ProfileSummary, region string, topicName string) (models.AwsSnsCreateTopicResult, error)
}

type RDSInventory interface {
	ListInstances(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsRdsInstance, error)
	DescribeInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) (models.AwsRdsInstance, error)
	StartDBInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error
	StopDBInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error
}

type ApiGatewayInventory interface {
	ListApis(ctx context.Context, profile models.ProfileSummary, region string) (models.AwsApiGatewayListResult, error)
	ListStages(ctx context.Context, profile models.ProfileSummary, region string, apiKey string) ([]models.AwsApiGatewayStage, error)
}

type SecretsManagerInventory interface {
	ListSecrets(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsSecretsManagerSecret, error)
	GetSecretValue(ctx context.Context, profile models.ProfileSummary, region string, secretID string) (string, error)
}

type ECSInventory interface {
	ListClusters(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsEcsCluster, error)
	DescribeCluster(ctx context.Context, profile models.ProfileSummary, region string, clusterArn string) (models.AwsEcsCluster, error)
	ListServices(ctx context.Context, profile models.ProfileSummary, region string, clusterArn string) ([]models.AwsEcsService, error)
	ListTasks(ctx context.Context, profile models.ProfileSummary, region string, clusterArn string, serviceArn string) ([]models.AwsEcsTask, error)
	DescribeTask(ctx context.Context, profile models.ProfileSummary, region string, clusterArn string, taskArn string) (models.AwsEcsTask, error)
}

type EKSInventory interface {
	ListClusters(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsEksCluster, error)
	DescribeCluster(ctx context.Context, profile models.ProfileSummary, region string, clusterName string) (models.AwsEksCluster, error)
	ListNodeGroups(ctx context.Context, profile models.ProfileSummary, region string, clusterName string) ([]models.AwsEksNodeGroup, error)
}

type CloudFormationInventory interface {
	DescribeStacks(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsCloudFormationStack, error)
	DescribeStackEvents(ctx context.Context, profile models.ProfileSummary, region string, stackName string) ([]models.AwsCloudFormationStackEvent, error)
}

type EventBridgeInventory interface {
	ListEventBuses(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsEventBridgeBus, error)
	ListRules(ctx context.Context, profile models.ProfileSummary, region string, busName string) ([]models.AwsEventBridgeRule, error)
}

type Route53Inventory interface {
	ListHostedZones(ctx context.Context, profile models.ProfileSummary) ([]models.AwsRoute53HostedZone, error)
	ListResourceRecordSets(ctx context.Context, profile models.ProfileSummary, hostedZoneID string) ([]models.AwsRoute53ResourceRecordSet, error)
}

type Elbv2Inventory interface {
	DescribeLoadBalancers(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsElbLoadBalancer, error)
	DescribeTargetGroups(ctx context.Context, profile models.ProfileSummary, region string, loadBalancerArn string) ([]models.AwsElbTargetGroup, error)
}

type KmsInventory interface {
	ListKeys(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsKmsKey, error)
	ListAliases(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsKmsAlias, error)
	DescribeKey(ctx context.Context, profile models.ProfileSummary, region string, keyID string) (models.AwsKmsKey, error)
}

type LogsInventory interface {
	ListLogGroups(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsLogGroup, error)
	DescribeLogGroup(ctx context.Context, profile models.ProfileSummary, region string, logGroupName string) (models.AwsLogGroup, error)
	CreateLogGroup(ctx context.Context, profile models.ProfileSummary, region string, logGroupName string) (models.AwsLogsCreateLogGroupResult, error)
	PutLogEvents(ctx context.Context, profile models.ProfileSummary, region string, logGroupName string, message string) (models.AwsLogsPutLogEventsResult, error)
	FilterEvents(ctx context.Context, profile models.ProfileSummary, region string, logGroupName string, filterPattern string, limit int) (models.AwsLogsFilterEventsResult, error)
}

type IAMInventory interface {
	ListRoles(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsIamRole, error)
	DescribeRole(ctx context.Context, profile models.ProfileSummary, region string, roleName string) (models.AwsIamRole, error)
	ListPolicies(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsIamPolicy, error)
	CreateRole(ctx context.Context, profile models.ProfileSummary, region string, roleName string) (models.AwsIamCreateRoleResult, error)
}

type AzureInventory interface {
	ListResourceGroups(ctx context.Context, profile models.ProfileSummary) ([]models.AzureResourceGroup, error)
	ListVirtualMachines(ctx context.Context, profile models.ProfileSummary, resourceGroup string) ([]models.AzureVirtualMachine, error)
	CreateResourceGroup(ctx context.Context, profile models.ProfileSummary, name string, location string) (models.AzureResourceGroup, error)
	DeleteResourceGroup(ctx context.Context, profile models.ProfileSummary, name string) error
	ListStorageAccounts(ctx context.Context, profile models.ProfileSummary) ([]models.AzureStorageAccount, error)
	ListBlobContainers(ctx context.Context, profile models.ProfileSummary, accountName string) ([]models.AzureBlobContainer, error)
	ListBlobs(ctx context.Context, profile models.ProfileSummary, accountName string, containerName string, prefix string) ([]models.AzureBlob, error)
	CreateStorageAccount(ctx context.Context, profile models.ProfileSummary, resourceGroup string, accountName string, location string) (models.AzureStorageAccount, error)
	CreateBlobContainer(ctx context.Context, profile models.ProfileSummary, accountName string, containerName string) error
	UploadBlob(ctx context.Context, profile models.ProfileSummary, accountName string, containerName string, blobName string, sourcePath string) (models.AzureBlobUploadResult, error)
	DeleteBlob(ctx context.Context, profile models.ProfileSummary, accountName string, containerName string, blobName string) error
	CopyBlob(ctx context.Context, profile models.ProfileSummary, accountName string, containerName string, sourceBlobName string, destinationBlobName string) (models.AzureBlobCopyResult, error)
	CreateFolderPrefix(ctx context.Context, profile models.ProfileSummary, accountName string, containerName string, folderPrefix string) (models.AzureBlobCreateFolderPrefixResult, error)
	InvokeVirtualMachineAction(ctx context.Context, profile models.ProfileSummary, resourceGroup string, vmName string, action string) error
	GetVirtualMachine(ctx context.Context, profile models.ProfileSummary, resourceGroup string, vmName string) (models.AzureVirtualMachine, error)
	ListBastionHosts(ctx context.Context, profile models.ProfileSummary) ([]models.AzureBastionHost, error)
	ListWebApps(ctx context.Context, profile models.ProfileSummary, resourceGroup string) ([]models.AzureWebApp, error)
	GetWebApp(ctx context.Context, profile models.ProfileSummary, resourceGroup string, appName string, slotName string) (models.AzureWebApp, error)
	CreateWebAppDeploymentSlot(ctx context.Context, profile models.ProfileSummary, resourceGroup string, appName string, slotName string) error
	SwapWebAppDeploymentSlots(ctx context.Context, profile models.ProfileSummary, resourceGroup string, appName string, slotName string) error
	ListAppServicePlans(ctx context.Context, profile models.ProfileSummary, resourceGroup string) ([]models.AzureAppServicePlan, error)
	GetAppServicePlan(ctx context.Context, profile models.ProfileSummary, resourceGroup string, planName string) (models.AzureAppServicePlan, error)
	ListWebAppDeploymentSlots(ctx context.Context, profile models.ProfileSummary, resourceGroup string, appName string) ([]models.AzureWebAppDeploymentSlot, error)
	ListWebAppSettings(ctx context.Context, profile models.ProfileSummary, resourceGroup string, appName string, slotName string) ([]models.AzureWebAppSetting, error)
	SetWebAppSetting(ctx context.Context, profile models.ProfileSummary, resourceGroup string, appName string, name string, value string, slotSetting bool, slotName string) error
	DeleteWebAppSetting(ctx context.Context, profile models.ProfileSummary, resourceGroup string, appName string, name string, slotName string) error
	InvokeWebAppAction(ctx context.Context, profile models.ProfileSummary, resourceGroup string, appName string, action string, slotName string) error
	CreateWebApp(ctx context.Context, profile models.ProfileSummary, resourceGroup string, appName string, location string, runtime string, existingPlanName string, newPlanName string, planSKU string) (models.AzureWebApp, error)
	ListLogAnalyticsWorkspaces(ctx context.Context, profile models.ProfileSummary) ([]models.AzureLogAnalyticsWorkspace, error)
	RunLogAnalyticsQuery(ctx context.Context, profile models.ProfileSummary, workspace string, query string, timespan string, maxRows int) (models.AzureLogQueryResult, error)
	ListLogAnalyticsTables(ctx context.Context, profile models.ProfileSummary, workspaceName string, workspaceQueryID string, resourceGroup string, includeColumns bool) ([]models.AzureLogAnalyticsTableInfo, error)
	GetLogAnalyticsTableSchema(ctx context.Context, profile models.ProfileSummary, workspaceQueryID string, tableName string) ([]string, error)
	DetectWafLogSchema(ctx context.Context, profile models.ProfileSummary, workspace string, timespan string) (models.AzureWafLogSchemaProfile, error)
	ListWafPolicies(ctx context.Context, profile models.ProfileSummary, withDetail bool) ([]models.AzureWafPolicySummary, error)
	GetWafPolicy(ctx context.Context, profile models.ProfileSummary, resourceGroup string, policyName string) (models.AzureWafPolicyDetail, error)
	UpdateWafPolicyMode(ctx context.Context, profile models.ProfileSummary, resourceGroup string, policyName string, mode string) error
	SetWafManagedRuleOverride(ctx context.Context, profile models.ProfileSummary, resourceGroup string, policyName string, ruleSetType string, ruleSetVersion string, ruleGroupName string, ruleID string, enabled bool) error
	AddWafExclusion(ctx context.Context, profile models.ProfileSummary, resourceGroup string, policyName string, exclusion models.AzureWafExclusion) error
	RemoveWafExclusion(ctx context.Context, profile models.ProfileSummary, resourceGroup string, policyName string, exclusion models.AzureWafExclusion) error
	ListFrontDoorProfiles(ctx context.Context, profile models.ProfileSummary, withWafLink bool) ([]models.AzureFrontDoorProfile, error)
	ListFrontDoorEndpoints(ctx context.Context, profile models.ProfileSummary, resourceGroup string, profileName string) ([]models.AzureFrontDoorEndpoint, error)
	ListFrontDoorOriginGroups(ctx context.Context, profile models.ProfileSummary, resourceGroup string, profileName string) ([]models.AzureFrontDoorOriginGroup, error)
	ListFrontDoorOrigins(ctx context.Context, profile models.ProfileSummary, resourceGroup string, profileName string, originGroupName string) ([]models.AzureFrontDoorOrigin, error)
	PurgeFrontDoorEndpointCache(ctx context.Context, profile models.ProfileSummary, resourceGroup string, profileName string, endpointName string, contentPaths []string, domains []string) error
	ListFunctionApps(ctx context.Context, profile models.ProfileSummary) ([]models.AzureFunctionApp, error)
	ListFunctions(ctx context.Context, profile models.ProfileSummary, resourceGroup string, appName string) ([]models.AzureFunction, error)
	InvokeFunction(ctx context.Context, profile models.ProfileSummary, resourceGroup string, appName string, functionName string, payload string) (models.AzureFunctionInvokeResult, error)
	ListKeyVaults(ctx context.Context, profile models.ProfileSummary) ([]models.AzureKeyVault, error)
	ListKeyVaultSecrets(ctx context.Context, profile models.ProfileSummary, vaultName string) ([]models.AzureKeyVaultSecret, error)
	GetKeyVaultSecret(ctx context.Context, profile models.ProfileSummary, vaultName string, secretName string) (string, error)
	SetKeyVaultSecret(ctx context.Context, profile models.ProfileSummary, vaultName string, secretName string, value string) (models.AzureKeyVaultSecret, error)
	ListCosmosAccounts(ctx context.Context, profile models.ProfileSummary) ([]models.AzureCosmosAccount, error)
	ListCosmosDatabases(ctx context.Context, profile models.ProfileSummary, account string, resourceGroup string) ([]models.AzureCosmosDatabase, error)
	ListCosmosContainers(ctx context.Context, profile models.ProfileSummary, account string, resourceGroup string, database string) ([]models.AzureCosmosContainer, error)
	ListCosmosItems(ctx context.Context, profile models.ProfileSummary, account string, resourceGroup string, database string, container string) ([]models.AzureCosmosItem, error)
	ListPostgresServers(ctx context.Context, profile models.ProfileSummary) ([]models.AzurePostgresServer, error)
	GetPostgresConnection(ctx context.Context, profile models.ProfileSummary, resourceGroup string, serverName string) (models.AzurePostgresConnection, error)
	StartPostgresServer(ctx context.Context, profile models.ProfileSummary, resourceGroup string, serverName string) (models.AzurePostgresLifecycleResult, error)
	StopPostgresServer(ctx context.Context, profile models.ProfileSummary, resourceGroup string, serverName string) (models.AzurePostgresLifecycleResult, error)
	ListStorageQueues(ctx context.Context, profile models.ProfileSummary, accountName string) ([]models.AzureStorageQueue, error)
	PeekQueueMessages(ctx context.Context, profile models.ProfileSummary, accountName string, queueName string) ([]models.AzureQueueMessage, error)
	// GetQueueApproximateMessageCount returns the queue's approximate message count.
	GetQueueApproximateMessageCount(ctx context.Context, profile models.ProfileSummary, accountName string, queueName string) (int64, error)
	ListEntraUsers(ctx context.Context, profile models.ProfileSummary) ([]models.AzureEntraUser, error)
	ListEntraGroups(ctx context.Context, profile models.ProfileSummary) ([]models.AzureEntraGroup, error)
	ListEntraAppRegistrations(ctx context.Context, profile models.ProfileSummary) ([]models.AzureEntraApp, error)
	CheckCLIExtensions(ctx context.Context) []models.AzureCLIExtensionStatus
}

// GcpStorageInventory lists Cloud Storage buckets and objects via the gcloud CLI adapter.
type GcpStorageInventory interface {
	ListBuckets(ctx context.Context, profile models.ProfileSummary) ([]models.GcpStorageBucket, error)
	ListObjects(ctx context.Context, profile models.ProfileSummary, bucketName string, prefix string, pageToken string) (models.GcpStorageObjectListPage, error)
}

// DockerRuntime, LocalStackManager, and AzureRuntimeManager are aliases of the
// consumer-owned ports defined in internal/app/runtime (F-029 Phase 1).
type DockerRuntime = appruntime.Docker
type LocalStackManager = appruntime.LocalStack
type AzureRuntimeManager = appruntime.AzureRuntime

// Notifier is the shared progress/notification contract used by the JSON-RPC
// transport. Defined in rpcapi so package rpc does not depend on app.
type Notifier = rpcapi.Notifier

// Deployer is an alias of the consumer-owned port defined in
// internal/app/deployment (F-029 Phase 2).
type Deployer = appdeployment.Deployer
