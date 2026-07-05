// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/cloudformation/types"
)

func TestCloudFormationStackSummaryMapsFields(t *testing.T) {
	created := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)
	updated := created.Add(time.Hour)
	got := cloudFormationStackSummary(types.Stack{
		StackId:         aws.String("arn:aws:cloudformation:us-east-1:123:stack/demo/abc"),
		StackName:       aws.String("demo"),
		StackStatus:     types.StackStatusCreateComplete,
		Description:     aws.String("Demo stack"),
		CreationTime:    &created,
		LastUpdatedTime: &updated,
	})
	if got.StackName != "demo" || got.StackStatus != "CREATE_COMPLETE" || got.CreationTime == "" {
		t.Fatalf("stack = %+v", got)
	}
}

func TestCloudFormationStackEventSummaryMapsFields(t *testing.T) {
	timestamp := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)
	got := cloudFormationStackEventSummary(types.StackEvent{
		EventId:              aws.String("evt-1"),
		Timestamp:            &timestamp,
		LogicalResourceId:    aws.String("Bucket"),
		ResourceStatus:       types.ResourceStatusCreateComplete,
		ResourceType:         aws.String("AWS::S3::Bucket"),
		ResourceStatusReason: aws.String("Resource creation complete"),
	})
	if got.EventId != "evt-1" || got.LogicalResourceId != "Bucket" || got.ResourceType != "AWS::S3::Bucket" {
		t.Fatalf("event = %+v", got)
	}
}