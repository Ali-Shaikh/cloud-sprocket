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

type countingCloudFormationInventory struct {
	describeStacks      atomic.Int32
	describeStackEvents atomic.Int32
	stacks              []models.AwsCloudFormationStack
	events              map[string][]models.AwsCloudFormationStackEvent
}

func (c *countingCloudFormationInventory) DescribeStacks(context.Context, models.ProfileSummary, string) ([]models.AwsCloudFormationStack, error) {
	c.describeStacks.Add(1)
	return c.stacks, nil
}

func (c *countingCloudFormationInventory) DescribeStackEvents(_ context.Context, _ models.ProfileSummary, _ string, stackName string) ([]models.AwsCloudFormationStackEvent, error) {
	c.describeStackEvents.Add(1)
	return c.events[stackName], nil
}

func TestAwsScopedCloudFormationInventoryLoadsStacksAndEvents(t *testing.T) {
	dataStore, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = dataStore.Close() })

	cloudformation := &countingCloudFormationInventory{
		stacks: []models.AwsCloudFormationStack{{
			StackId:     "arn:aws:cloudformation:us-east-1:123:stack/demo/abc",
			StackName:   "demo",
			StackStatus: "CREATE_COMPLETE",
		}},
		events: map[string][]models.AwsCloudFormationStackEvent{
			"demo": {{
				EventId:           "evt-1",
				LogicalResourceId: "MyBucket",
				ResourceStatus:    "CREATE_COMPLETE",
				ResourceType:      "AWS::S3::Bucket",
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
		cloudformation: cloudformation,
		eventbridge:    stubEventBridgeInventory{},
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
		CurrentProviderID:               "aws",
		SelectedProfileID:               "sandbox",
		SelectedCloudFormationRegion:    "us-east-1",
		SelectedCloudFormationStackName: "demo",
		IsLocked:                        true,
	}

	workspace := service.buildWorkspaceSnapshotOpts(snapshot, session, workspaceSnapshotOptions{
		awsScope:           "cloudformation",
		skipAzureInventory: true,
	})
	if cloudformation.describeStacks.Load() == 0 {
		t.Fatal("expected CloudFormation DescribeStacks on scoped enrichment")
	}
	if len(workspace.CloudFormationStacks) != 1 {
		t.Fatalf("expected 1 stack, got %+v", workspace.CloudFormationStacks)
	}
	if cloudformation.describeStackEvents.Load() == 0 {
		t.Fatal("expected CloudFormation DescribeStackEvents on scoped enrichment with selected stack")
	}
	if len(workspace.CloudFormationStackEvents) != 1 {
		t.Fatalf("expected 1 stack event, got %+v", workspace.CloudFormationStackEvents)
	}
}
