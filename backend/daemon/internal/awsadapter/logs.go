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

const (
	maxLogGroupRecentEvents = 25
	defaultFilterEventsLimit  = 25
	maxFilterEventsLimit      = 100
)

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

const cloudsprocketTestLogStream = "cloudsprocket-test"

func (l *LogsInventory) CreateLogGroup(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	logGroupName string,
) (models.AwsLogsCreateLogGroupResult, error) {
	logGroupName = strings.TrimSpace(logGroupName)
	if logGroupName == "" {
		return models.AwsLogsCreateLogGroupResult{}, fmt.Errorf("log group name is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := l.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsLogsCreateLogGroupResult{}, err
	}
	client := logsClient(cfg, profile)
	_, err = client.CreateLogGroup(ctx, &cloudwatchlogs.CreateLogGroupInput{
		LogGroupName: aws.String(logGroupName),
	})
	if err != nil {
		return models.AwsLogsCreateLogGroupResult{}, err
	}
	return models.AwsLogsCreateLogGroupResult{
		LogGroupName: logGroupName,
		Region:       region,
	}, nil
}

func (l *LogsInventory) PutLogEvents(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	logGroupName string,
	message string,
) (models.AwsLogsPutLogEventsResult, error) {
	logGroupName = strings.TrimSpace(logGroupName)
	message = strings.TrimSpace(message)
	if logGroupName == "" {
		return models.AwsLogsPutLogEventsResult{}, fmt.Errorf("log group name is required")
	}
	if message == "" {
		message = fmt.Sprintf("CloudSprocket test event at %s", time.Now().UTC().Format(time.RFC3339))
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := l.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsLogsPutLogEventsResult{}, err
	}
	client := logsClient(cfg, profile)
	_, _ = client.CreateLogStream(ctx, &cloudwatchlogs.CreateLogStreamInput{
		LogGroupName:  aws.String(logGroupName),
		LogStreamName: aws.String(cloudsprocketTestLogStream),
	})
	timestamp := time.Now().UnixMilli()
	_, err = client.PutLogEvents(ctx, &cloudwatchlogs.PutLogEventsInput{
		LogGroupName:  aws.String(logGroupName),
		LogStreamName: aws.String(cloudsprocketTestLogStream),
		LogEvents: []cwtypes.InputLogEvent{
			{
				Message:   aws.String(message),
				Timestamp: aws.Int64(timestamp),
			},
		},
	})
	if err != nil {
		return models.AwsLogsPutLogEventsResult{}, err
	}
	return models.AwsLogsPutLogEventsResult{
		LogGroupName:  logGroupName,
		LogStreamName: cloudsprocketTestLogStream,
		Summary:       fmt.Sprintf("Injected test event into %s.", logGroupName),
	}, nil
}

// FilterEvents searches recent CloudWatch log events for a group with an optional filter pattern.
func (l *LogsInventory) FilterEvents(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	logGroupName string,
	filterPattern string,
	limit int,
) (models.AwsLogsFilterEventsResult, error) {
	logGroupName = strings.TrimSpace(logGroupName)
	filterPattern = strings.TrimSpace(filterPattern)
	if logGroupName == "" {
		return models.AwsLogsFilterEventsResult{}, fmt.Errorf("log group name is required")
	}
	limit = clampFilterEventsLimit(limit)
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := l.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsLogsFilterEventsResult{}, err
	}
	client := logsClient(cfg, profile)
	events, err := l.filterLogEvents(ctx, client, logGroupName, filterPattern, limit)
	if err != nil {
		return models.AwsLogsFilterEventsResult{}, err
	}
	return models.AwsLogsFilterEventsResult{
		LogGroupName:  logGroupName,
		FilterPattern: filterPattern,
		Events:        events,
		Summary:       filterEventsSummary(logGroupName, filterPattern, len(events)),
	}, nil
}

func clampFilterEventsLimit(limit int) int {
	if limit <= 0 {
		return defaultFilterEventsLimit
	}
	if limit > maxFilterEventsLimit {
		return maxFilterEventsLimit
	}
	return limit
}

func filterEventsSummary(logGroupName, filterPattern string, count int) string {
	if filterPattern == "" {
		return fmt.Sprintf("Found %d recent event(s) in %s.", count, logGroupName)
	}
	return fmt.Sprintf("Found %d event(s) in %s matching %q.", count, logGroupName, filterPattern)
}

func formatFilteredLogEvent(event cwtypes.FilteredLogEvent) string {
	message := awsString(event.Message)
	if event.Timestamp != nil {
		ts := time.UnixMilli(*event.Timestamp).UTC().Format("2006-01-02 15:04:05")
		return fmt.Sprintf("%s %s", ts, message)
	}
	return message
}

func (l *LogsInventory) recentEvents(
	ctx context.Context,
	client *cloudwatchlogs.Client,
	logGroupName string,
	limit int,
) ([]string, error) {
	return l.filterLogEvents(ctx, client, logGroupName, "", limit)
}

func (l *LogsInventory) filterLogEvents(
	ctx context.Context,
	client *cloudwatchlogs.Client,
	logGroupName string,
	filterPattern string,
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
	if filterPattern != "" {
		input.FilterPattern = aws.String(filterPattern)
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
		lines = append(lines, formatFilteredLogEvent(event))
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