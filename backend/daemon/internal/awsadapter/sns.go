// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sns"
	"github.com/aws/aws-sdk-go-v2/service/sns/types"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

// SNSInventory provides read-only inventory for SNS topics and subscriptions.
type SNSInventory struct {
	settings config.Settings
}

func NewSNSInventory(settings config.Settings) *SNSInventory {
	return &SNSInventory{settings: settings}
}

func (s *SNSInventory) ListTopics(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) ([]models.AwsSnsTopic, error) {
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := s.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := snsClient(cfg, profile)
	paginator := sns.NewListTopicsPaginator(client, &sns.ListTopicsInput{})
	topics := []models.AwsSnsTopic{}
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, topic := range page.Topics {
			arn := awsString(topic.TopicArn)
			topics = append(topics, models.AwsSnsTopic{
				TopicArn:  arn,
				TopicName: topicNameFromArn(arn),
			})
		}
	}
	sort.SliceStable(topics, func(i, j int) bool {
		return topics[i].TopicName < topics[j].TopicName
	})
	return topics, nil
}

func (s *SNSInventory) DescribeTopic(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	topicArn string,
) (models.AwsSnsTopic, error) {
	topicArn = strings.TrimSpace(topicArn)
	if topicArn == "" {
		return models.AwsSnsTopic{}, fmt.Errorf("topic ARN is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := s.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsSnsTopic{}, err
	}

	client := snsClient(cfg, profile)
	attrOut, err := client.GetTopicAttributes(ctx, &sns.GetTopicAttributesInput{
		TopicArn: aws.String(topicArn),
	})
	if err != nil {
		return models.AwsSnsTopic{}, err
	}

	topic := snsTopicSummary(topicArn, attrOut.Attributes)
	subPaginator := sns.NewListSubscriptionsByTopicPaginator(client, &sns.ListSubscriptionsByTopicInput{
		TopicArn: aws.String(topicArn),
	})
	for subPaginator.HasMorePages() {
		page, err := subPaginator.NextPage(ctx)
		if err != nil {
			return topic, err
		}
		for _, sub := range page.Subscriptions {
			topic.Subscriptions = append(topic.Subscriptions, snsSubscriptionSummary(sub))
		}
	}
	sort.SliceStable(topic.Subscriptions, func(i, j int) bool {
		return topic.Subscriptions[i].SubscriptionArn < topic.Subscriptions[j].SubscriptionArn
	})
	return topic, nil
}

func (s *SNSInventory) Publish(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	topicArn string,
	message string,
) (models.AwsSnsPublishResult, error) {
	topicArn = strings.TrimSpace(topicArn)
	message = strings.TrimSpace(message)
	if topicArn == "" {
		return models.AwsSnsPublishResult{}, fmt.Errorf("topic ARN is required")
	}
	if message == "" {
		return models.AwsSnsPublishResult{}, fmt.Errorf("message is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := s.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsSnsPublishResult{}, err
	}

	client := snsClient(cfg, profile)
	res, err := client.Publish(ctx, &sns.PublishInput{
		TopicArn: aws.String(topicArn),
		Message:  aws.String(message),
	})
	if err != nil {
		return models.AwsSnsPublishResult{}, err
	}
	messageID := awsString(res.MessageId)
	return models.AwsSnsPublishResult{
		TopicArn:  topicArn,
		MessageID: messageID,
		Summary:   fmt.Sprintf("Published message %s to the topic.", messageID),
	}, nil
}

func (s *SNSInventory) CreateTopic(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	topicName string,
) (models.AwsSnsCreateTopicResult, error) {
	topicName = strings.TrimSpace(topicName)
	if topicName == "" {
		return models.AwsSnsCreateTopicResult{}, fmt.Errorf("topic name is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := s.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsSnsCreateTopicResult{}, err
	}

	client := snsClient(cfg, profile)
	res, err := client.CreateTopic(ctx, &sns.CreateTopicInput{
		Name: aws.String(topicName),
	})
	if err != nil {
		return models.AwsSnsCreateTopicResult{}, err
	}
	topicArn := awsString(res.TopicArn)
	return models.AwsSnsCreateTopicResult{
		TopicName: topicName,
		TopicArn:  topicArn,
	}, nil
}

func (s *SNSInventory) loadConfig(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) (aws.Config, error) {
	return loadAWSConfig(ctx, s.settings, profile, region)
}

func snsClient(cfg aws.Config, profile models.ProfileSummary) *sns.Client {
	return sns.NewFromConfig(cfg, func(options *sns.Options) {
		if endpointURL := awsEndpointURL(profile); endpointURL != "" {
			options.BaseEndpoint = aws.String(endpointURL)
		}
	})
}

func topicNameFromArn(arn string) string {
	if arn == "" {
		return ""
	}
	parts := strings.Split(arn, ":")
	if len(parts) == 0 {
		return arn
	}
	return parts[len(parts)-1]
}

func snsTopicSummary(topicArn string, attributes map[string]string) models.AwsSnsTopic {
	topic := models.AwsSnsTopic{
		TopicArn:  topicArn,
		TopicName: topicNameFromArn(topicArn),
	}
	if attributes == nil {
		return topic
	}
	topic.DisplayName = attributes["DisplayName"]
	topic.Owner = attributes["Owner"]
	topic.SubscriptionsConfirmed = attributes["SubscriptionsConfirmed"]
	topic.SubscriptionsPending = attributes["SubscriptionsPending"]
	return topic
}

func snsSubscriptionSummary(sub types.Subscription) models.AwsSnsSubscription {
	return models.AwsSnsSubscription{
		SubscriptionArn: awsString(sub.SubscriptionArn),
		Protocol:        awsString(sub.Protocol),
		Endpoint:        awsString(sub.Endpoint),
		Owner:           awsString(sub.Owner),
	}
}
