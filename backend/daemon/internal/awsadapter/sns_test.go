// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"context"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/sns/types"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

func TestTopicNameFromArn(t *testing.T) {
	got := topicNameFromArn("arn:aws:sns:us-east-1:123456789012:order-events")
	if got != "order-events" {
		t.Fatalf("topicNameFromArn = %q", got)
	}
}

func TestSnsTopicSummaryMapsAttributes(t *testing.T) {
	got := snsTopicSummary("arn:aws:sns:us-east-1:000000000000:alerts", map[string]string{
		"DisplayName":             "Alerts",
		"Owner":                   "000000000000",
		"SubscriptionsConfirmed":  "2",
		"SubscriptionsPending":    "0",
	})
	if got.TopicName != "alerts" || got.DisplayName != "Alerts" {
		t.Fatalf("topic = %+v", got)
	}
}

func TestSnsSubscriptionSummaryMapsFields(t *testing.T) {
	arn := "arn:aws:sns:us-east-1:000000000000:alerts:sub-1"
	protocol := "sqs"
	endpoint := "arn:aws:sqs:us-east-1:000000000000:alerts-queue"
	got := snsSubscriptionSummary(types.Subscription{
		SubscriptionArn: &arn,
		Protocol:        &protocol,
		Endpoint:        &endpoint,
	})
	if got.Protocol != protocol || got.Endpoint != endpoint {
		t.Fatalf("subscription = %+v", got)
	}
}

func TestCreateSubscriptionRequiresFields(t *testing.T) {
	inv := NewSNSInventory(config.Settings{})
	_, err := inv.CreateSubscription(context.Background(), models.ProfileSummary{}, "us-east-1", "", "sqs", "arn:aws:sqs:us-east-1:1:q")
	if err == nil {
		t.Fatal("expected topic ARN required")
	}
	_, err = inv.CreateSubscription(context.Background(), models.ProfileSummary{}, "us-east-1", "arn:aws:sns:us-east-1:1:t", "carrier-pigeon", "x")
	if err == nil {
		t.Fatal("expected unsupported protocol")
	}
	_, err = inv.CreateSubscription(context.Background(), models.ProfileSummary{}, "us-east-1", "arn:aws:sns:us-east-1:1:t", "sqs", "")
	if err == nil {
		t.Fatal("expected endpoint required")
	}
}