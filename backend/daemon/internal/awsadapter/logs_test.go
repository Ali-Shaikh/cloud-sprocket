// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	cwtypes "github.com/aws/aws-sdk-go-v2/service/cloudwatchlogs/types"
)

func TestLogGroupSummaryMapsFields(t *testing.T) {
	got := logGroupSummary(cwtypes.LogGroup{
		LogGroupName:    aws.String("/aws/lambda/process-order"),
		Arn:             aws.String("arn:aws:logs:us-east-1:000000000000:log-group:/aws/lambda/process-order"),
		StoredBytes:     aws.Int64(4096),
		RetentionInDays: aws.Int32(7),
		CreationTime:    aws.Int64(1718452800000),
	})
	if got.LogGroupName != "/aws/lambda/process-order" || got.StoredBytes != 4096 || got.RetentionInDays != 7 {
		t.Fatalf("log group = %+v", got)
	}
}

func TestClampFilterEventsLimit(t *testing.T) {
	if got := clampFilterEventsLimit(0); got != defaultFilterEventsLimit {
		t.Fatalf("zero limit = %d, want %d", got, defaultFilterEventsLimit)
	}
	if got := clampFilterEventsLimit(-5); got != defaultFilterEventsLimit {
		t.Fatalf("negative limit = %d, want %d", got, defaultFilterEventsLimit)
	}
	if got := clampFilterEventsLimit(10); got != 10 {
		t.Fatalf("in-range limit = %d, want 10", got)
	}
	if got := clampFilterEventsLimit(maxFilterEventsLimit + 50); got != maxFilterEventsLimit {
		t.Fatalf("over-max limit = %d, want %d", got, maxFilterEventsLimit)
	}
}

func TestFormatFilteredLogEvent(t *testing.T) {
	withTS := formatFilteredLogEvent(cwtypes.FilteredLogEvent{
		Message:   aws.String("hello world"),
		Timestamp: aws.Int64(1_718_452_800_000),
	})
	if withTS != "2024-06-15 12:00:00 hello world" {
		t.Fatalf("with timestamp = %q", withTS)
	}
	withoutTS := formatFilteredLogEvent(cwtypes.FilteredLogEvent{
		Message: aws.String("plain"),
	})
	if withoutTS != "plain" {
		t.Fatalf("without timestamp = %q", withoutTS)
	}
}

func TestFilterEventsSummary(t *testing.T) {
	plain := filterEventsSummary("/aws/lambda/app", "", 3)
	if plain != "Found 3 recent event(s) in /aws/lambda/app." {
		t.Fatalf("plain summary = %q", plain)
	}
	filtered := filterEventsSummary("/aws/lambda/app", "ERROR", 1)
	if filtered != `Found 1 event(s) in /aws/lambda/app matching "ERROR".` {
		t.Fatalf("filtered summary = %q", filtered)
	}
}