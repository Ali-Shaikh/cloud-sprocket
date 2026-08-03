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
}

// SNSWriter is the SNS action surface used by publish/create handlers.
type SNSWriter interface {
	Publish(ctx context.Context, profile models.ProfileSummary, region string, topicArn string, message string) (models.AwsSnsPublishResult, error)
	CreateTopic(ctx context.Context, profile models.ProfileSummary, region string, topicName string) (models.AwsSnsCreateTopicResult, error)
}

// DynamoDBWriter is the DynamoDB write surface.
type DynamoDBWriter interface {
	PutItem(ctx context.Context, profile models.ProfileSummary, region string, tableName string, itemJSON string) (models.AwsDynamoDBWriteResult, error)
	DeleteItem(ctx context.Context, profile models.ProfileSummary, region string, tableName string, keyJSON string) (models.AwsDynamoDBWriteResult, error)
}

// IAMWriter is the IAM create-role surface.
type IAMWriter interface {
	CreateRole(ctx context.Context, profile models.ProfileSummary, region string, roleName string) (models.AwsIamCreateRoleResult, error)
}

// SecretsReader is the Secrets Manager reveal surface.
type SecretsReader interface {
	GetSecretValue(ctx context.Context, profile models.ProfileSummary, region string, secretID string) (string, error)
}
