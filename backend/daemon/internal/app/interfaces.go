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
