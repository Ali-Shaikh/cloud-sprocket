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

type countingS3Inventory struct {
	stubS3Inventory
	listBuckets atomic.Int32
}

func (c *countingS3Inventory) ListBuckets(ctx context.Context, profile models.ProfileSummary) ([]models.AwsS3Bucket, error) {
	c.listBuckets.Add(1)
	return c.stubS3Inventory.ListBuckets(ctx, profile)
}

type countingEC2Inventory struct {
	stubEC2Inventory
	listRegions    atomic.Int32
	listInstances  atomic.Int32
}

func (c *countingEC2Inventory) ListRegions(ctx context.Context, profile models.ProfileSummary) ([]string, error) {
	c.listRegions.Add(1)
	return c.stubEC2Inventory.ListRegions(ctx, profile)
}

func (c *countingEC2Inventory) ListInstances(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsEc2Instance, error) {
	c.listInstances.Add(1)
	return c.stubEC2Inventory.ListInstances(ctx, profile, region)
}

type countingLambdaInventory struct {
	stubLambdaInventory
	listFunctions atomic.Int32
}

func (c *countingLambdaInventory) ListFunctions(context.Context, models.ProfileSummary, string) ([]models.AwsLambdaFunction, error) {
	c.listFunctions.Add(1)
	return nil, nil
}

func awsTestService(t *testing.T) (*Service, *countingS3Inventory, *countingEC2Inventory, *countingLambdaInventory) {
	t.Helper()
	dataStore, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = dataStore.Close() })

	s3 := &countingS3Inventory{stubS3Inventory: stubS3Inventory{
		buckets: []models.AwsS3Bucket{{Name: "demo-bucket"}},
	}}
	ec2 := &countingEC2Inventory{stubEC2Inventory: stubEC2Inventory{
		regions:   []string{"us-east-1"},
		instances: map[string][]models.AwsEc2Instance{"us-east-1": {{InstanceID: "i-001"}}},
	}}
	lambda := &countingLambdaInventory{}

	service := &Service{
		store:    dataStore,
		s3:       s3,
		ec2:      ec2,
		lambda:   lambda,
		dynamodb: stubDynamoDBInventory{},
		sqs:      stubSQSInventory{},
		sns:      stubSNSInventory{},
		rds:      stubRDSInventory{},
		logs:     stubLogsInventory{},
		iam:      stubIAMInventory{},
		now:      func() time.Time { return time.Now().UTC() },
	}
	return service, s3, ec2, lambda
}

func TestAwsScopedWorkspaceOnlyRunsTargetEnricher(t *testing.T) {
	service, s3, ec2, lambda := awsTestService(t)

	snapshot := discovery.Snapshot{
		Providers: []models.ProviderSummary{{ProviderID: "aws", Label: "AWS"}},
		Profiles:  []models.ProfileSummary{{ProviderID: "aws", ProfileID: "sandbox", DisplayName: "sandbox"}},
	}
	session := models.SessionSnapshot{
		CurrentProviderID:  "aws",
		SelectedProfileID:  "sandbox",
		SelectedEC2Region:  "us-east-1",
		IsLocked:           true,
	}

	workspace := service.buildWorkspaceSnapshotOpts(snapshot, session, workspaceSnapshotOptions{
		awsScope:           "ec2",
		skipAzureInventory: true,
	})

	if ec2.listRegions.Load() == 0 {
		t.Fatal("expected EC2 scoped snapshot to list regions")
	}
	if ec2.listInstances.Load() == 0 {
		t.Fatal("expected EC2 scoped snapshot to list instances")
	}
	if s3.listBuckets.Load() != 0 {
		t.Fatalf("expected S3 enricher to be skipped, listBuckets=%d", s3.listBuckets.Load())
	}
	if lambda.listFunctions.Load() != 0 {
		t.Fatalf("expected Lambda enricher to be skipped, listFunctions=%d", lambda.listFunctions.Load())
	}
	if workspace.SelectedEC2Region != "us-east-1" || len(workspace.EC2Instances) != 1 {
		t.Fatalf("expected EC2 inventory only, got region=%q instances=%+v", workspace.SelectedEC2Region, workspace.EC2Instances)
	}
	if len(workspace.S3Buckets) != 0 {
		t.Fatalf("expected no S3 buckets in EC2-scoped snapshot, got %+v", workspace.S3Buckets)
	}
}

func TestBuildWorkspaceSnapshotParallelNoRace(t *testing.T) {
	service, s3, ec2, lambda := awsTestService(t)

	snapshot := discovery.Snapshot{
		Providers: []models.ProviderSummary{{ProviderID: "aws", Label: "AWS"}},
		Profiles:  []models.ProfileSummary{{ProviderID: "aws", ProfileID: "sandbox", DisplayName: "sandbox"}},
	}
	session := models.SessionSnapshot{
		CurrentProviderID: "aws",
		SelectedProfileID: "sandbox",
		IsLocked:          true,
	}

	workspace := service.buildWorkspaceSnapshotOpts(snapshot, session, workspaceSnapshotOptions{})
	if s3.listBuckets.Load() == 0 || ec2.listInstances.Load() == 0 || lambda.listFunctions.Load() == 0 {
		t.Fatalf(
			"expected parallel full enrichment, s3=%d ec2Instances=%d lambda=%d",
			s3.listBuckets.Load(),
			ec2.listInstances.Load(),
			lambda.listFunctions.Load(),
		)
	}
	if len(workspace.S3Buckets) != 1 || len(workspace.EC2Instances) != 1 {
		t.Fatalf("expected populated AWS inventories, buckets=%+v instances=%+v", workspace.S3Buckets, workspace.EC2Instances)
	}
}