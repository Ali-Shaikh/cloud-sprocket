// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/cloudformation"
	"github.com/aws/aws-sdk-go-v2/service/cloudformation/types"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

const maxCloudFormationStackEvents = 25

// CloudFormationInventory provides read-only inventory for CloudFormation stacks and events.
type CloudFormationInventory struct {
	settings config.Settings
}

func NewCloudFormationInventory(settings config.Settings) *CloudFormationInventory {
	return &CloudFormationInventory{settings: settings}
}

func (c *CloudFormationInventory) DescribeStacks(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) ([]models.AwsCloudFormationStack, error) {
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := c.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := cloudFormationClient(cfg, profile)
	paginator := cloudformation.NewDescribeStacksPaginator(client, &cloudformation.DescribeStacksInput{})
	stacks := make([]models.AwsCloudFormationStack, 0)
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, stack := range page.Stacks {
			stacks = append(stacks, cloudFormationStackSummary(stack))
		}
	}
	sort.SliceStable(stacks, func(i, j int) bool {
		return stacks[i].StackName < stacks[j].StackName
	})
	return stacks, nil
}

func (c *CloudFormationInventory) DescribeStackEvents(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	stackName string,
) ([]models.AwsCloudFormationStackEvent, error) {
	stackName = strings.TrimSpace(stackName)
	if stackName == "" {
		return nil, fmt.Errorf("stack name is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := c.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := cloudFormationClient(cfg, profile)
	paginator := cloudformation.NewDescribeStackEventsPaginator(client, &cloudformation.DescribeStackEventsInput{
		StackName: aws.String(stackName),
	})
	events := make([]models.AwsCloudFormationStackEvent, 0, maxCloudFormationStackEvents)
	for paginator.HasMorePages() && len(events) < maxCloudFormationStackEvents {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, event := range page.StackEvents {
			events = append(events, cloudFormationStackEventSummary(event))
			if len(events) >= maxCloudFormationStackEvents {
				break
			}
		}
	}
	return events, nil
}

func (c *CloudFormationInventory) loadConfig(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) (aws.Config, error) {
	return loadAWSConfig(ctx, c.settings, profile, region)
}

func cloudFormationClient(cfg aws.Config, profile models.ProfileSummary) *cloudformation.Client {
	return cloudformation.NewFromConfig(cfg, func(options *cloudformation.Options) {
		if endpointURL := awsEndpointURL(profile); endpointURL != "" {
			options.BaseEndpoint = aws.String(endpointURL)
		}
	})
}

func cloudFormationStackSummary(stack types.Stack) models.AwsCloudFormationStack {
	summary := models.AwsCloudFormationStack{
		StackId:     awsString(stack.StackId),
		StackName:   awsString(stack.StackName),
		StackStatus: string(stack.StackStatus),
		Description: awsString(stack.Description),
	}
	if stack.CreationTime != nil {
		summary.CreationTime = stack.CreationTime.UTC().Format(time.RFC3339)
	}
	if stack.LastUpdatedTime != nil {
		summary.LastUpdatedTime = stack.LastUpdatedTime.UTC().Format(time.RFC3339)
	}
	return summary
}

func cloudFormationStackEventSummary(event types.StackEvent) models.AwsCloudFormationStackEvent {
	summary := models.AwsCloudFormationStackEvent{
		EventId:              awsString(event.EventId),
		LogicalResourceId:    awsString(event.LogicalResourceId),
		ResourceStatus:       string(event.ResourceStatus),
		ResourceType:         awsString(event.ResourceType),
		ResourceStatusReason: awsString(event.ResourceStatusReason),
	}
	if event.Timestamp != nil {
		summary.Timestamp = event.Timestamp.UTC().Format(time.RFC3339)
	}
	return summary
}
