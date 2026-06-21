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