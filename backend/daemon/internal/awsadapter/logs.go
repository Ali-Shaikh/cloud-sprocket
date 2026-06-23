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
	"github.com/aws/aws-sdk-go-v2/service/cloudwatchlogs"
	cwtypes "github.com/aws/aws-sdk-go-v2/service/cloudwatchlogs/types"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

const maxLogGroupRecentEvents = 25

// LogsInventory provides read-only CloudWatch Logs group inventory and event tail.
type LogsInventory struct {
	settings config.Settings
}

func NewLogsInventory(settings config.Settings) *LogsInventory {
	return &LogsInventory{settings: settings}
}

func (l *LogsInventory) ListLogGroups(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) ([]models.AwsLogGroup, error) {
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := l.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := logsClient(cfg, profile)
	paginator := cloudwatchlogs.NewDescribeLogGroupsPaginator(client, &cloudwatchlogs.DescribeLogGroupsInput{})
	groups := []models.AwsLogGroup{}
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, group := range page.LogGroups {
			groups = append(groups, logGroupSummary(group))
		}
	}
	sort.SliceStable(groups, func(i, j int) bool {
		return groups[i].LogGroupName < groups[j].LogGroupName
	})
	return groups, nil
}

func (l *LogsInventory) DescribeLogGroup(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	logGroupName string,
) (models.AwsLogGroup, error) {
	logGroupName = strings.TrimSpace(logGroupName)
	if logGroupName == "" {
		return models.AwsLogGroup{}, fmt.Errorf("log group name is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := l.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsLogGroup{}, err
	}

	client := logsClient(cfg, profile)
	res, err := client.DescribeLogGroups(ctx, &cloudwatchlogs.DescribeLogGroupsInput{
		LogGroupNamePrefix: aws.String(logGroupName),
		Limit:              aws.Int32(1),
	})
	if err != nil {
		return models.AwsLogGroup{}, err
	}
	if len(res.LogGroups) == 0 || awsString(res.LogGroups[0].LogGroupName) != logGroupName {
		return models.AwsLogGroup{LogGroupName: logGroupName}, nil
	}

	group := logGroupSummary(res.LogGroups[0])
	events, _ := l.recentEvents(ctx, client, logGroupName, maxLogGroupRecentEvents)
	group.RecentEvents = events
	return group, nil
}

func (l *LogsInventory) recentEvents(
	ctx context.Context,
	client *cloudwatchlogs.Client,
	logGroupName string,
	limit int,
) ([]string, error) {
	if logGroupName == "" || limit <= 0 {
		return nil, nil
	}
	start := time.Now().Add(-24 * time.Hour).UnixMilli()
	input := &cloudwatchlogs.FilterLogEventsInput{
		LogGroupName: aws.String(logGroupName),
		StartTime:    aws.Int64(start),
		Limit:        aws.Int32(int32(limit)),
	}
	paginator := cloudwatchlogs.NewFilterLogEventsPaginator(client, input)
	events := []cwtypes.FilteredLogEvent{}
	for paginator.HasMorePages() && len(events) < limit {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		events = append(events, page.Events...)
	}
	sort.SliceStable(events, func(i, j int) bool {
		ti := int64(0)
		tj := int64(0)
		if events[i].Timestamp != nil {
			ti = *events[i].Timestamp
		}
		if events[j].Timestamp != nil {
			tj = *events[j].Timestamp
		}
		return ti > tj
	})
	if len(events) > limit {
		events = events[:limit]
	}
	lines := make([]string, 0, len(events))
	for _, event := range events {
		message := awsString(event.Message)
		if event.Timestamp != nil {
			ts := time.UnixMilli(*event.Timestamp).UTC().Format("2006-01-02 15:04:05")
			lines = append(lines, fmt.Sprintf("%s %s", ts, message))
		} else {
			lines = append(lines, message)
		}
	}
	return lines, nil
}

func (l *LogsInventory) loadConfig(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) (aws.Config, error) {
	return loadAWSConfig(ctx, l.settings, profile, region)
}

func logsClient(cfg aws.Config, profile models.ProfileSummary) *cloudwatchlogs.Client {
	return cloudwatchlogs.NewFromConfig(cfg, func(options *cloudwatchlogs.Options) {
		if endpointURL := awsEndpointURL(profile); endpointURL != "" {
			options.BaseEndpoint = aws.String(endpointURL)
		}
	})
}

func logGroupSummary(group cwtypes.LogGroup) models.AwsLogGroup {
	summary := models.AwsLogGroup{
		LogGroupName: awsString(group.LogGroupName),
		Arn:          awsString(group.Arn),
	}
	if group.StoredBytes != nil {
		summary.StoredBytes = *group.StoredBytes
	}
	if group.RetentionInDays != nil {
		summary.RetentionInDays = *group.RetentionInDays
	}
	if group.CreationTime != nil {
		summary.CreationTime = *group.CreationTime
	}
	return summary
}