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

type countingRoute53Inventory struct {
	listHostedZones         atomic.Int32
	listResourceRecordSets  atomic.Int32
	hostedZones             []models.AwsRoute53HostedZone
	records                 map[string][]models.AwsRoute53ResourceRecordSet
}

func (c *countingRoute53Inventory) ListHostedZones(context.Context, models.ProfileSummary) ([]models.AwsRoute53HostedZone, error) {
	c.listHostedZones.Add(1)
	return c.hostedZones, nil
}

func (c *countingRoute53Inventory) ListResourceRecordSets(_ context.Context, _ models.ProfileSummary, hostedZoneID string) ([]models.AwsRoute53ResourceRecordSet, error) {
	c.listResourceRecordSets.Add(1)
	return c.records[hostedZoneID], nil
}

func TestAwsScopedRoute53InventoryLoadsHostedZonesAndRecords(t *testing.T) {
	dataStore, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = dataStore.Close() })

	route53Inventory := &countingRoute53Inventory{
		hostedZones: []models.AwsRoute53HostedZone{{
			HostedZoneID: "/hostedzone/Z123",
			Name:         "example.com.",
			RecordCount:  2,
		}},
		records: map[string][]models.AwsRoute53ResourceRecordSet{
			"/hostedzone/Z123": {{
				Name:   "www.example.com.",
				Type:   "A",
				TTL:    300,
				Values: []string{"203.0.113.10"},
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
		eventbridge:    stubEventBridgeInventory{},
		route53:        route53Inventory,
		elbv2:          stubElbv2Inventory{},
		kms:            stubKmsInventory{},
		apigateway:     stubApiGatewayInventory{},
		secretsManager: stubSecretsManagerInventory{},
		logs:           &stubLogsInventory{},
		iam:            &stubIAMInventory{},
		now:            func() time.Time { return time.Now().UTC() },
	}

	snapshot := discovery.Snapshot{
		Providers: []models.ProviderSummary{{ProviderID: "aws", Label: "AWS"}},
		Profiles:  []models.ProfileSummary{{ProviderID: "aws", ProfileID: "sandbox", DisplayName: "sandbox"}},
	}
	session := models.SessionSnapshot{
		CurrentProviderID:           "aws",
		SelectedProfileID:           "sandbox",
		SelectedRoute53HostedZoneID: "/hostedzone/Z123",
		IsLocked:                    true,
	}

	workspace := service.buildWorkspaceSnapshotOpts(context.Background(), snapshot, session, workspaceSnapshotOptions{
		awsScope:           "route53",
		skipAzureInventory: true,
	})
	if route53Inventory.listHostedZones.Load() == 0 {
		t.Fatal("expected Route 53 ListHostedZones on scoped enrichment")
	}
	if len(workspace.Route53HostedZones) != 1 {
		t.Fatalf("expected 1 hosted zone, got %+v", workspace.Route53HostedZones)
	}
	if route53Inventory.listResourceRecordSets.Load() == 0 {
		t.Fatal("expected Route 53 ListResourceRecordSets on scoped enrichment with selected zone")
	}
	if len(workspace.Route53ResourceRecordSets) != 1 {
		t.Fatalf("expected 1 record set, got %+v", workspace.Route53ResourceRecordSets)
	}
}