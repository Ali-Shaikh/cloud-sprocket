// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package labs

import (
	"context"

	"cloudsprocket/backend/daemon/internal/models"
)

// SQSWrite is the SQS surface used by lab invoke-write actions.
type SQSWrite interface {
	SendMessage(ctx context.Context, profile models.ProfileSummary, region string, queueURL string, messageBody string) (models.AwsSqsSendResult, error)
}

// DynamoDBWrite is the DynamoDB put surface used by lab invoke-write actions.
type DynamoDBWrite interface {
	PutItem(ctx context.Context, profile models.ProfileSummary, region string, tableName string, itemJSON string) (models.AwsDynamoDBWriteResult, error)
}

// SNSWrite is the SNS publish surface used by lab invoke-write actions.
type SNSWrite interface {
	Publish(ctx context.Context, profile models.ProfileSummary, region string, topicArn string, message string) (models.AwsSnsPublishResult, error)
}

// LambdaWrite is the Lambda invoke surface used by lab invoke-write actions.
type LambdaWrite interface {
	InvokeFunction(ctx context.Context, profile models.ProfileSummary, region string, functionName string, payload []byte) (models.AwsLambdaInvokeResult, error)
}

// LogsWrite is the CloudWatch Logs put surface used by lab invoke-write actions.
type LogsWrite interface {
	PutLogEvents(ctx context.Context, profile models.ProfileSummary, region string, logGroupName string, message string) (models.AwsLogsPutLogEventsResult, error)
}

// S3Write is the S3 upload surface used by lab invoke-write actions.
type S3Write interface {
	UploadFile(ctx context.Context, profile models.ProfileSummary, bucketName string, objectKey string, sourcePath string) (models.AwsS3UploadResult, error)
}
