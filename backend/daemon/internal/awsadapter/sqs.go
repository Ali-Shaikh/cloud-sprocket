// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"context"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/aws/aws-sdk-go-v2/service/sqs/types"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

const maxSQSPeekMessages = 10

var sqsQueueAttributeNames = []types.QueueAttributeName{
	types.QueueAttributeNameApproximateNumberOfMessages,
	types.QueueAttributeNameApproximateNumberOfMessagesNotVisible,
	types.QueueAttributeNameApproximateNumberOfMessagesDelayed,
	types.QueueAttributeNameVisibilityTimeout,
	types.QueueAttributeNameCreatedTimestamp,
	types.QueueAttributeNameQueueArn,
	types.QueueAttributeNameDelaySeconds,
	types.QueueAttributeNameReceiveMessageWaitTimeSeconds,
}

// SQSInventory provides read-only queue inventory and bounded message peek.
type SQSInventory struct {
	settings config.Settings
}

func NewSQSInventory(settings config.Settings) *SQSInventory {
	return &SQSInventory{settings: settings}
}

func (q *SQSInventory) ListQueues(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) ([]models.AwsSqsQueue, error) {
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := q.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := sqsClient(cfg, profile)
	res, err := client.ListQueues(ctx, &sqs.ListQueuesInput{})
	if err != nil {
		return nil, err
	}

	queues := make([]models.AwsSqsQueue, 0, len(res.QueueUrls))
	for _, queueURL := range res.QueueUrls {
		queues = append(queues, models.AwsSqsQueue{
			QueueName: queueNameFromURL(queueURL),
			QueueURL:  queueURL,
		})
	}
	sort.SliceStable(queues, func(i, j int) bool {
		return queues[i].QueueName < queues[j].QueueName
	})
	return queues, nil
}

func (q *SQSInventory) DescribeQueue(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	queueURL string,
) (models.AwsSqsQueue, error) {
	queueURL = strings.TrimSpace(queueURL)
	if queueURL == "" {
		return models.AwsSqsQueue{}, fmt.Errorf("queue URL is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := q.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsSqsQueue{}, err
	}

	client := sqsClient(cfg, profile)
	res, err := client.GetQueueAttributes(ctx, &sqs.GetQueueAttributesInput{
		QueueUrl:       aws.String(queueURL),
		AttributeNames: sqsQueueAttributeNames,
	})
	if err != nil {
		return models.AwsSqsQueue{}, err
	}
	return sqsQueueSummary(queueURL, res.Attributes), nil
}

func (q *SQSInventory) PeekMessages(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	queueURL string,
) (models.AwsSqsPeekResult, error) {
	queueURL = strings.TrimSpace(queueURL)
	if queueURL == "" {
		return models.AwsSqsPeekResult{}, fmt.Errorf("queue URL is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := q.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsSqsPeekResult{}, err
	}

	client := sqsClient(cfg, profile)
	res, err := client.ReceiveMessage(ctx, &sqs.ReceiveMessageInput{
		QueueUrl:            aws.String(queueURL),
		MaxNumberOfMessages: maxSQSPeekMessages,
		VisibilityTimeout:   0,
		WaitTimeSeconds:     0,
		MessageSystemAttributeNames: []types.MessageSystemAttributeName{
			types.MessageSystemAttributeNameAll,
		},
		MessageAttributeNames: []string{"All"},
	})
	if err != nil {
		return models.AwsSqsPeekResult{}, err
	}

	messages := make([]models.AwsSqsMessage, 0, len(res.Messages))
	for _, message := range res.Messages {
		messages = append(messages, sqsMessageSummary(message))
	}
	return models.AwsSqsPeekResult{
		QueueURL: queueURL,
		Messages: messages,
		Summary:  fmt.Sprintf("Peeked %d messages without deleting them.", len(messages)),
	}, nil
}

func (q *SQSInventory) SendMessage(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	queueURL string,
	messageBody string,
) (models.AwsSqsSendResult, error) {
	queueURL = strings.TrimSpace(queueURL)
	messageBody = strings.TrimSpace(messageBody)
	if queueURL == "" {
		return models.AwsSqsSendResult{}, fmt.Errorf("queue URL is required")
	}
	if messageBody == "" {
		return models.AwsSqsSendResult{}, fmt.Errorf("message body is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := q.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsSqsSendResult{}, err
	}

	client := sqsClient(cfg, profile)
	res, err := client.SendMessage(ctx, &sqs.SendMessageInput{
		QueueUrl:    aws.String(queueURL),
		MessageBody: aws.String(messageBody),
	})
	if err != nil {
		return models.AwsSqsSendResult{}, err
	}
	messageID := awsString(res.MessageId)
	return models.AwsSqsSendResult{
		QueueURL:  queueURL,
		MessageID: messageID,
		Summary:   fmt.Sprintf("Sent message %s to the queue.", messageID),
	}, nil
}

func (q *SQSInventory) CreateQueue(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	queueName string,
) (models.AwsSqsCreateQueueResult, error) {
	queueName = strings.TrimSpace(queueName)
	if queueName == "" {
		return models.AwsSqsCreateQueueResult{}, fmt.Errorf("queue name is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := q.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsSqsCreateQueueResult{}, err
	}

	client := sqsClient(cfg, profile)
	res, err := client.CreateQueue(ctx, &sqs.CreateQueueInput{
		QueueName: aws.String(queueName),
	})
	if err != nil {
		return models.AwsSqsCreateQueueResult{}, err
	}
	queueURL := awsString(res.QueueUrl)
	return models.AwsSqsCreateQueueResult{
		QueueName: queueName,
		QueueURL:  queueURL,
	}, nil
}

// PurgeQueue deletes all messages from the selected queue (write action).
// AWS enforces a purge rate limit of one purge per queue every 60 seconds.
func (q *SQSInventory) PurgeQueue(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	queueURL string,
) (models.AwsSqsPurgeResult, error) {
	queueURL = strings.TrimSpace(queueURL)
	if queueURL == "" {
		return models.AwsSqsPurgeResult{}, fmt.Errorf("queue URL is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := q.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsSqsPurgeResult{}, err
	}

	client := sqsClient(cfg, profile)
	_, err = client.PurgeQueue(ctx, &sqs.PurgeQueueInput{
		QueueUrl: aws.String(queueURL),
	})
	if err != nil {
		return models.AwsSqsPurgeResult{}, fmt.Errorf("purge SQS queue: %w", err)
	}
	queueName := queueNameFromURL(queueURL)
	return models.AwsSqsPurgeResult{
		QueueURL:  queueURL,
		QueueName: queueName,
		Summary:   fmt.Sprintf("Purged all messages from SQS queue %s.", queueName),
	}, nil
}

func (q *SQSInventory) loadConfig(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) (aws.Config, error) {
	return loadAWSConfig(ctx, q.settings, profile, region)
}

func sqsClient(cfg aws.Config, profile models.ProfileSummary) *sqs.Client {
	return sqs.NewFromConfig(cfg, func(options *sqs.Options) {
		if endpointURL := awsEndpointURL(profile); endpointURL != "" {
			options.BaseEndpoint = aws.String(endpointURL)
		}
	})
}

func queueNameFromURL(queueURL string) string {
	parsed, err := url.Parse(queueURL)
	if err != nil {
		return queueURL
	}
	segments := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	if len(segments) == 0 {
		return queueURL
	}
	return segments[len(segments)-1]
}

func sqsQueueSummary(queueURL string, attributes map[string]string) models.AwsSqsQueue {
	summary := models.AwsSqsQueue{
		QueueName: queueNameFromURL(queueURL),
		QueueURL:  queueURL,
	}
	if attributes == nil {
		return summary
	}
	summary.ApproximateNumberOfMessages = parseInt64Attribute(attributes, string(types.QueueAttributeNameApproximateNumberOfMessages))
	summary.ApproximateNumberOfMessagesNotVisible = parseInt64Attribute(attributes, string(types.QueueAttributeNameApproximateNumberOfMessagesNotVisible))
	summary.ApproximateNumberOfMessagesDelayed = parseInt64Attribute(attributes, string(types.QueueAttributeNameApproximateNumberOfMessagesDelayed))
	summary.VisibilityTimeout = parseInt32Attribute(attributes, string(types.QueueAttributeNameVisibilityTimeout))
	summary.CreatedTimestamp = parseInt64Attribute(attributes, string(types.QueueAttributeNameCreatedTimestamp))
	summary.QueueArn = attributes[string(types.QueueAttributeNameQueueArn)]
	summary.DelaySeconds = parseInt32Attribute(attributes, string(types.QueueAttributeNameDelaySeconds))
	summary.ReceiveMessageWaitTimeSeconds = parseInt32Attribute(attributes, string(types.QueueAttributeNameReceiveMessageWaitTimeSeconds))
	return summary
}

func sqsMessageSummary(message types.Message) models.AwsSqsMessage {
	summary := models.AwsSqsMessage{
		MessageID:     awsString(message.MessageId),
		Body:          awsString(message.Body),
		ReceiptHandle: awsString(message.ReceiptHandle),
	}
	if message.Attributes != nil {
		summary.SentTimestamp = parseInt64Attribute(message.Attributes, string(types.MessageSystemAttributeNameSentTimestamp))
		summary.ApproximateReceiveCount = parseInt64Attribute(message.Attributes, string(types.MessageSystemAttributeNameApproximateReceiveCount))
	}
	return summary
}

func parseInt64Attribute(attributes map[string]string, key string) int64 {
	value, ok := attributes[key]
	if !ok || strings.TrimSpace(value) == "" {
		return 0
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return 0
	}
	return parsed
}

func parseInt32Attribute(attributes map[string]string, key string) int32 {
	value, ok := attributes[key]
	if !ok || strings.TrimSpace(value) == "" {
		return 0
	}
	parsed, err := strconv.ParseInt(value, 10, 32)
	if err != nil {
		return 0
	}
	return int32(parsed)
}
