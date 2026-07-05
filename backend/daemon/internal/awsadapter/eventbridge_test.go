// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/eventbridge/types"
)

func TestEventBridgeBusSummaryMapsFields(t *testing.T) {
	got := eventBridgeBusSummary(types.EventBus{
		Name: aws.String("default"),
		Arn:  aws.String("arn:aws:events:us-east-1:123:event-bus/default"),
	})
	if got.Name != "default" || got.Arn == "" {
		t.Fatalf("bus = %+v", got)
	}
}

func TestEventBridgeRuleSummaryMapsFields(t *testing.T) {
	got := eventBridgeRuleSummary(types.Rule{
		Name:               aws.String("hourly"),
		Arn:                aws.String("arn:aws:events:us-east-1:123:rule/default/hourly"),
		State:              types.RuleStateEnabled,
		Description:        aws.String("Hourly trigger"),
		ScheduleExpression: aws.String("rate(1 hour)"),
	})
	if got.Name != "hourly" || got.State != "ENABLED" || got.ScheduleExpression != "rate(1 hour)" {
		t.Fatalf("rule = %+v", got)
	}
}