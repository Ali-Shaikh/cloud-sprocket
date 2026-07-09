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

type countingElbv2Inventory struct {
	describeLoadBalancers atomic.Int32
	describeTargetGroups  atomic.Int32
	loadBalancers         []models.AwsElbLoadBalancer
	targetGroups          map[string][]models.AwsElbTargetGroup
}

func (c *countingElbv2Inventory) DescribeLoadBalancers(context.Context, models.ProfileSummary, string) ([]models.AwsElbLoadBalancer, error) {
	c.describeLoadBalancers.Add(1)
	return c.loadBalancers, nil
}

func (c *countingElbv2Inventory) DescribeTargetGroups(_ context.Context, _ models.ProfileSummary, _ string, loadBalancerArn string) ([]models.AwsElbTargetGroup, error) {
	c.describeTargetGroups.Add(1)
	return c.targetGroups[loadBalancerArn], nil
}

func TestAwsScopedElbv2InventoryLoadsLoadBalancersAndTargetGroups(t *testing.T) {
	dataStore, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = dataStore.Close() })

	loadBalancerArn := "arn:aws:elasticloadbalancing:us-east-1:123:loadbalancer/app/demo/abc"
	elbv2Inventory := &countingElbv2Inventory{
		loadBalancers: []models.AwsElbLoadBalancer{{
			LoadBalancerArn:  loadBalancerArn,
			LoadBalancerName: "demo-alb",
			DNSName:          "demo-alb.elb.amazonaws.com",
			Type:             "application",
			Scheme:           "internet-facing",
			State:            "active",
		}},
		targetGroups: map[string][]models.AwsElbTargetGroup{
			loadBalancerArn: {{
				TargetGroupArn:  "arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/demo/abc",
				TargetGroupName: "demo-tg",
				Protocol:        "HTTP",
				Port:            8080,
				TargetType:      "ip",
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
		route53:        stubRoute53Inventory{},
		elbv2:          elbv2Inventory,
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
		CurrentProviderID:          "aws",
		SelectedProfileID:          "sandbox",
		SelectedElbRegion:          "us-east-1",
		SelectedElbLoadBalancerArn: loadBalancerArn,
		IsLocked:                   true,
	}

	workspace := service.buildWorkspaceSnapshotOpts(snapshot, session, workspaceSnapshotOptions{
		awsScope:           "elb",
		skipAzureInventory: true,
	})
	if elbv2Inventory.describeLoadBalancers.Load() == 0 {
		t.Fatal("expected ELB DescribeLoadBalancers on scoped enrichment")
	}
	if len(workspace.ElbLoadBalancers) != 1 {
		t.Fatalf("expected 1 load balancer, got %+v", workspace.ElbLoadBalancers)
	}
	if elbv2Inventory.describeTargetGroups.Load() == 0 {
		t.Fatal("expected ELB DescribeTargetGroups on scoped enrichment with selected load balancer")
	}
	if len(workspace.ElbTargetGroups) != 1 {
		t.Fatalf("expected 1 target group, got %+v", workspace.ElbTargetGroups)
	}
}