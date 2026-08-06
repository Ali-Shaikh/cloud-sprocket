// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package aws

import (
	"context"

	"cloudsprocket/backend/daemon/internal/models"
)

// SQSWriter is the SQS action surface used by write/peek handlers.
type SQSWriter interface {
	PeekMessages(ctx context.Context, profile models.ProfileSummary, region string, queueURL string) (models.AwsSqsPeekResult, error)
	SendMessage(ctx context.Context, profile models.ProfileSummary, region string, queueURL string, messageBody string) (models.AwsSqsSendResult, error)
	CreateQueue(ctx context.Context, profile models.ProfileSummary, region string, queueName string) (models.AwsSqsCreateQueueResult, error)
	PurgeQueue(ctx context.Context, profile models.ProfileSummary, region string, queueURL string) (models.AwsSqsPurgeResult, error)
}

// SNSWriter is the SNS action surface used by publish/create handlers.
type SNSWriter interface {
	Publish(ctx context.Context, profile models.ProfileSummary, region string, topicArn string, message string) (models.AwsSnsPublishResult, error)
	CreateTopic(ctx context.Context, profile models.ProfileSummary, region string, topicName string) (models.AwsSnsCreateTopicResult, error)
	CreateSubscription(ctx context.Context, profile models.ProfileSummary, region string, topicArn string, protocol string, endpoint string) (models.AwsSnsCreateSubscriptionResult, error)
}

// DynamoDBWriter is the DynamoDB write and sample-scan surface.
type DynamoDBWriter interface {
	PutItem(ctx context.Context, profile models.ProfileSummary, region string, tableName string, itemJSON string) (models.AwsDynamoDBWriteResult, error)
	DeleteItem(ctx context.Context, profile models.ProfileSummary, region string, tableName string, keyJSON string) (models.AwsDynamoDBWriteResult, error)
	// ScanSampleItems returns one page of sample items. exclusiveStartToken empty means the first page.
	ScanSampleItems(ctx context.Context, profile models.ProfileSummary, region string, tableName string, exclusiveStartToken string, limit int32) (models.AwsDynamoDBScanPage, error)
}

// IAMWriter is the IAM create-role surface.
type IAMWriter interface {
	CreateRole(ctx context.Context, profile models.ProfileSummary, region string, roleName string) (models.AwsIamCreateRoleResult, error)
}

// SecretsReader is the Secrets Manager reveal surface.
type SecretsReader interface {
	GetSecretValue(ctx context.Context, profile models.ProfileSummary, region string, secretID string) (string, error)
}

// S3Writer is the S3 mutation and async job surface (list/upload/presign).
type S3Writer interface {
	ListObjects(ctx context.Context, profile models.ProfileSummary, bucketName string, prefix string, continuationToken string) (models.AwsS3ObjectListPage, error)
	UploadFile(ctx context.Context, profile models.ProfileSummary, bucketName string, objectKey string, sourcePath string) (models.AwsS3UploadResult, error)
	PresignGetObject(ctx context.Context, profile models.ProfileSummary, bucketName string, objectKey string, durationSeconds int) (models.AwsS3PresignResult, error)
	DeleteObject(ctx context.Context, profile models.ProfileSummary, bucketName string, objectKey string) (models.AwsS3DeleteObjectResult, error)
	CreateBucket(ctx context.Context, profile models.ProfileSummary, bucketName string, region string) (models.AwsS3CreateBucketResult, error)
	CopyObject(ctx context.Context, profile models.ProfileSummary, bucketName string, sourceObjectKey string, destinationObjectKey string) (models.AwsS3CopyObjectResult, error)
	CreateFolderPrefix(ctx context.Context, profile models.ProfileSummary, bucketName string, folderPrefix string) (models.AwsS3CreateFolderPrefixResult, error)
}

// LambdaWriter is the Lambda describe/invoke/create/delete surface.
type LambdaWriter interface {
	DescribeFunction(ctx context.Context, profile models.ProfileSummary, region string, functionName string) (models.AwsLambdaFunction, error)
	InvokeFunction(ctx context.Context, profile models.ProfileSummary, region string, functionName string, payload []byte) (models.AwsLambdaInvokeResult, error)
	CreateFunction(ctx context.Context, profile models.ProfileSummary, region string, input models.AwsLambdaCreateInput) (models.AwsLambdaFunction, error)
	DeleteFunction(ctx context.Context, profile models.ProfileSummary, region string, functionName string) (models.AwsLambdaDeleteFunctionResult, error)
}

// LogsWriter is the CloudWatch Logs create/put/filter surface.
type LogsWriter interface {
	CreateLogGroup(ctx context.Context, profile models.ProfileSummary, region string, logGroupName string) (models.AwsLogsCreateLogGroupResult, error)
	PutLogEvents(ctx context.Context, profile models.ProfileSummary, region string, logGroupName string, message string) (models.AwsLogsPutLogEventsResult, error)
	FilterEvents(ctx context.Context, profile models.ProfileSummary, region string, logGroupName string, filterPattern string, limit int) (models.AwsLogsFilterEventsResult, error)
}

// EC2Writer is the synchronous EC2 launch surface.
type EC2Writer interface {
	RunInstances(ctx context.Context, profile models.ProfileSummary, region string, instanceType string) (models.AwsEc2RunInstancesResult, error)
}

// EC2Lifecycle is the async EC2 start/stop/reboot/terminate surface used by job handlers.
type EC2Lifecycle interface {
	StartInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error
	StopInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error
	RebootInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error
	TerminateInstances(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error
	ListInstances(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsEc2Instance, error)
}

// RDSLifecycle is the async RDS start/stop/reboot surface used by job handlers.
type RDSLifecycle interface {
	StartDBInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error
	StopDBInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error
	RebootDBInstance(ctx context.Context, profile models.ProfileSummary, region string, instanceID string) error
	ListInstances(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsRdsInstance, error)
}

// ECSWriter is the ECS force-new-deployment and scale surface.
type ECSWriter interface {
	ForceNewDeployment(ctx context.Context, profile models.ProfileSummary, region string, clusterArn string, serviceArn string) (models.AwsEcsForceNewDeploymentResult, error)
	UpdateDesiredCount(ctx context.Context, profile models.ProfileSummary, region string, clusterArn string, serviceArn string, desiredCount int32) (models.AwsEcsUpdateDesiredCountResult, error)
}
