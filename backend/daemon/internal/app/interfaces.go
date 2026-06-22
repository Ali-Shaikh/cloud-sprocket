// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"

	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/tofu"
)

type S3Inventory interface {
	ListBuckets(ctx context.Context, profile models.ProfileSummary) ([]models.AwsS3Bucket, error)
	ListObjects(ctx context.Context, profile models.ProfileSummary, bucketName string, prefix string) ([]models.AwsS3Object, error)
	HeadObject(ctx context.Context, profile models.ProfileSummary, bucketName string, objectKey string) ([]models.DetailField, error)
	UploadFile(ctx context.Context, profile models.ProfileSummary, bucketName string, objectKey string, sourcePath string) (models.AwsS3UploadResult, error)
	PresignGetObject(ctx context.Context, profile models.ProfileSummary, bucketName string, objectKey string, durationSeconds int) (models.AwsS3PresignResult, error)
}

type EC2Inventory interface {
	ListRegions(ctx context.Context, profile models.ProfileSummary) ([]string, error)
	ListInstances(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsEc2Instance, error)
	StartInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error
	StopInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error
	RebootInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error
}

type LambdaInventory interface {
	ListFunctions(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsLambdaFunction, error)
	DescribeFunction(ctx context.Context, profile models.ProfileSummary, region string, functionName string) (models.AwsLambdaFunction, error)
	InvokeFunction(ctx context.Context, profile models.ProfileSummary, region string, functionName string, payload []byte) (models.AwsLambdaInvokeResult, error)
	CreateFunction(ctx context.Context, profile models.ProfileSummary, region string, input models.AwsLambdaCreateInput) (models.AwsLambdaFunction, error)
}

type DynamoDBInventory interface {
	ListTables(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsDynamoDBTable, error)
	DescribeTable(ctx context.Context, profile models.ProfileSummary, region string, tableName string) (models.AwsDynamoDBTable, error)
}

type SQSInventory interface {
	ListQueues(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsSqsQueue, error)
	DescribeQueue(ctx context.Context, profile models.ProfileSummary, region string, queueURL string) (models.AwsSqsQueue, error)
	PeekMessages(ctx context.Context, profile models.ProfileSummary, region string, queueURL string) (models.AwsSqsPeekResult, error)
}

type SNSInventory interface {
	ListTopics(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsSnsTopic, error)
	DescribeTopic(ctx context.Context, profile models.ProfileSummary, region string, topicArn string) (models.AwsSnsTopic, error)
}

type RDSInventory interface {
	ListInstances(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsRdsInstance, error)
	DescribeInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) (models.AwsRdsInstance, error)
}

type LogsInventory interface {
	ListLogGroups(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsLogGroup, error)
	DescribeLogGroup(ctx context.Context, profile models.ProfileSummary, region string, logGroupName string) (models.AwsLogGroup, error)
}

type IAMInventory interface {
	ListRoles(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsIamRole, error)
	DescribeRole(ctx context.Context, profile models.ProfileSummary, region string, roleName string) (models.AwsIamRole, error)
	ListPolicies(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsIamPolicy, error)
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
	InvokeVirtualMachineAction(ctx context.Context, profile models.ProfileSummary, resourceGroup string, vmName string, action string) error
	GetVirtualMachine(ctx context.Context, profile models.ProfileSummary, resourceGroup string, vmName string) (models.AzureVirtualMachine, error)
	ListBastionHosts(ctx context.Context, profile models.ProfileSummary) ([]models.AzureBastionHost, error)
	ListWebApps(ctx context.Context, profile models.ProfileSummary, resourceGroup string) ([]models.AzureWebApp, error)
	CreateWebApp(ctx context.Context, profile models.ProfileSummary, resourceGroup string, appName string, location string, runtime string) (models.AzureWebApp, error)
	ListLogAnalyticsWorkspaces(ctx context.Context, profile models.ProfileSummary) ([]models.AzureLogAnalyticsWorkspace, error)
	RunLogAnalyticsQuery(ctx context.Context, profile models.ProfileSummary, workspace string, query string, timespan string, maxRows int) (models.AzureLogQueryResult, error)
	ListLogAnalyticsTables(ctx context.Context, profile models.ProfileSummary, workspaceName string, resourceGroup string, includeColumns bool) ([]models.AzureLogAnalyticsTableInfo, error)
	DetectWafLogSchema(ctx context.Context, profile models.ProfileSummary, workspace string, timespan string) (models.AzureWafLogSchemaProfile, error)
	ListWafPolicies(ctx context.Context, profile models.ProfileSummary, withDetail bool) ([]models.AzureWafPolicySummary, error)
	GetWafPolicy(ctx context.Context, profile models.ProfileSummary, resourceGroup string, policyName string) (models.AzureWafPolicyDetail, error)
	UpdateWafPolicyMode(ctx context.Context, profile models.ProfileSummary, resourceGroup string, policyName string, mode string) error
	SetWafManagedRuleOverride(ctx context.Context, profile models.ProfileSummary, resourceGroup string, policyName string, ruleSetType string, ruleSetVersion string, ruleGroupName string, ruleID string, enabled bool) error
	AddWafExclusion(ctx context.Context, profile models.ProfileSummary, resourceGroup string, policyName string, exclusion models.AzureWafExclusion) error
	RemoveWafExclusion(ctx context.Context, profile models.ProfileSummary, resourceGroup string, policyName string, exclusion models.AzureWafExclusion) error
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
	ListStorageQueues(ctx context.Context, profile models.ProfileSummary, accountName string) ([]models.AzureStorageQueue, error)
	PeekQueueMessages(ctx context.Context, profile models.ProfileSummary, accountName string, queueName string) ([]models.AzureQueueMessage, error)
	ListEntraUsers(ctx context.Context, profile models.ProfileSummary) ([]models.AzureEntraUser, error)
	ListEntraGroups(ctx context.Context, profile models.ProfileSummary) ([]models.AzureEntraGroup, error)
	ListEntraAppRegistrations(ctx context.Context, profile models.ProfileSummary) ([]models.AzureEntraApp, error)
	CheckCLIExtensions(ctx context.Context) []models.AzureCLIExtensionStatus
}

type DockerRuntime interface {
	Snapshot(ctx context.Context) (models.DockerRuntimeSnapshot, error)
	ListOwnedResources(ctx context.Context) ([]models.ManagedDockerResource, error)
}

type LocalStackManager interface {
	Status(ctx context.Context) (models.LocalStackStatus, error)
	Start(ctx context.Context, options models.LocalStackStartOptions) (models.LocalStackStatus, error)
	Stop(ctx context.Context) (models.LocalStackStatus, error)
	Logs(ctx context.Context, tail int) (models.EmulatorLogSnapshot, error)
	EnsureManagedProfile() error
}

type AzureRuntimeManager interface {
	Status(ctx context.Context) (models.LocalStackStatus, error)
	Start(ctx context.Context, options models.LocalStackStartOptions) (models.LocalStackStatus, error)
	Stop(ctx context.Context) (models.LocalStackStatus, error)
	Logs(ctx context.Context, tail int) (models.EmulatorLogSnapshot, error)
	EnsureManagedConfig() error
}

type Notifier interface {
	Notify(method string, payload any) error
}

// Deployer runs recipe deployments through the IaC engine. Implemented by
// *deploy.Engine; an interface so tests can inject a fake.
type Deployer interface {
	Available() bool
	Version(ctx context.Context) (string, error)
	BinaryPath() string
	Install(ctx context.Context) (string, error)
	Preflight(ctx context.Context, deployment *deploy.Deployment) error
	TargetLabel(deployment *deploy.Deployment) string
	Prepare(deployment *deploy.Deployment) error
	Plan(ctx context.Context, deployment *deploy.Deployment, onLine tofu.LogFunc) (deploy.PlanSummary, error)
	Apply(ctx context.Context, deployment *deploy.Deployment, onLine tofu.LogFunc) (deploy.ApplyResult, error)
	RetryPostApply(ctx context.Context, deployment *deploy.Deployment, onLine tofu.LogFunc) error
	Destroy(ctx context.Context, deployment *deploy.Deployment, onLine tofu.LogFunc) error
	RemoveWorkspace(id string) error
}
