// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
)

type countingEventBridgeInventory struct {
	listEventBuses atomic.Int32
	listRules      atomic.Int32
	buses          []models.AwsEventBridgeBus
	rules          map[string][]models.AwsEventBridgeRule
}

func (c *countingEventBridgeInventory) ListEventBuses(context.Context, models.ProfileSummary, string) ([]models.AwsEventBridgeBus, error) {
	c.listEventBuses.Add(1)
	return c.buses, nil
}

func (c *countingEventBridgeInventory) ListRules(_ context.Context, _ models.ProfileSummary, _ string, busName string) ([]models.AwsEventBridgeRule, error) {
	c.listRules.Add(1)
	return c.rules[busName], nil
}

func TestAwsScopedEventBridgeInventoryLoadsBusesAndRules(t *testing.T) {
	dataStore, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = dataStore.Close() })

	eventbridge := &countingEventBridgeInventory{
		buses: []models.AwsEventBridgeBus{{
			Name: "default",
			Arn:  "arn:aws:events:us-east-1:123:event-bus/default",
		}},
		rules: map[string][]models.AwsEventBridgeRule{
			"default": {{
				Name:               "hourly",
				State:              "ENABLED",
				ScheduleExpression: "rate(1 hour)",
			}},
		},
	}

	service := &Service{
		store:          dataStore,
		ec2:            &stubEC2Inventory{regions: []string{"us-east-1"}},
		lambda:         stubLambdaInventory{},
		dynamodb:       stubDynamoDBInventory{},
		sqs:            stubSQSInventory{},
		sns:            stubSNSInventory{},
		rds:            stubRDSInventory{},
		ecs:            stubECSInventory{},
		eks:            stubEKSInventory{},
		cloudformation: stubCloudFormationInventory{},
		eventbridge:    eventbridge,
		route53:        stubRoute53Inventory{},
		elbv2:          stubElbv2Inventory{},
		apigateway:     stubApiGatewayInventory{},
		secretsManager: stubSecretsManagerInventory{},
		logs:           stubLogsInventory{},
		iam:            stubIAMInventory{},
		now:            func() time.Time { return time.Now().UTC() },
	}

	snapshot := discovery.Snapshot{
		Providers: []models.ProviderSummary{{ProviderID: "aws", Label: "AWS"}},
		Profiles:  []models.ProfileSummary{{ProviderID: "aws", ProfileID: "sandbox", DisplayName: "sandbox"}},
	}
	session := models.SessionSnapshot{
		CurrentProviderID:          "aws",
		SelectedProfileID:          "sandbox",
		SelectedEventBridgeRegion:  "us-east-1",
		SelectedEventBridgeBusName: "default",
		IsLocked:                   true,
	}

	workspace := service.buildWorkspaceSnapshotOpts(snapshot, session, workspaceSnapshotOptions{
		awsScope:           "eventbridge",
		skipAzureInventory: true,
	})
	if eventbridge.listEventBuses.Load() == 0 {
		t.Fatal("expected EventBridge ListEventBuses on scoped enrichment")
	}
	if len(workspace.EventBridgeBuses) != 1 {
		t.Fatalf("expected 1 bus, got %+v", workspace.EventBridgeBuses)
	}
	if eventbridge.listRules.Load() == 0 {
		t.Fatal("expected EventBridge ListRules on scoped enrichment with selected bus")
	}
	if len(workspace.EventBridgeRules) != 1 {
		t.Fatalf("expected 1 rule, got %+v", workspace.EventBridgeRules)
	}
}
