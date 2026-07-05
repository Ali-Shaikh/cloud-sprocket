// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
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
		ecs:         stubECSInventory{},
		eks:            stubEKSInventory{},
		cloudformation: stubCloudFormationInventory{},
		eventbridge:    stubEventBridgeInventory{},
		route53:        stubRoute53Inventory{},
		elbv2:          stubElbv2Inventory{},
		apigateway:     stubApiGatewayInventory{},
		secretsManager: stubSecretsManagerInventory{},
		logs:        stubLogsInventory{},
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

func TestAwsDeferredWorkspaceGetSkipsNonCoreEnrichers(t *testing.T) {
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

	workspace := service.buildWorkspaceSnapshotOpts(snapshot, session, workspaceSnapshotOptions{
		lightweightAWS:       true,
		awsDeferredInventory: true,
		skipAzureInventory:   true,
	})

	if s3.listBuckets.Load() == 0 {
		t.Fatal("expected S3 buckets on deferred workspace.get")
	}
	if ec2.listRegions.Load() == 0 {
		t.Fatal("expected EC2 regions on deferred workspace.get")
	}
	if lambda.listFunctions.Load() != 0 {
		t.Fatalf("deferred workspace.get should not load Lambda, listFunctions=%d", lambda.listFunctions.Load())
	}
	if len(workspace.S3Buckets) != 1 {
		t.Fatalf("expected deferred S3 inventory, got %+v", workspace.S3Buckets)
	}
	if len(workspace.EC2Regions) != 1 {
		t.Fatalf("expected deferred EC2 regions, got %+v", workspace.EC2Regions)
	}
	if len(workspace.LambdaFunctions) != 0 {
		t.Fatal("deferred workspace.get should not load Lambda functions")
	}
}

func TestAwsInventoryGetRunsSingleEnricher(t *testing.T) {
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")
	mustWriteFile(
		t,
		filepath.Join(home, ".aws", "config"),
		"[profile sandbox]\nregion = us-east-1\n",
	)

	settings := config.FromEnv(map[string]string{}, "linux", home)
	if err := settings.EnsureRuntimeDirs(); err != nil {
		t.Fatalf("EnsureRuntimeDirs: %v", err)
	}

	dataStore, err := store.Open(settings.DatabasePath)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	defer dataStore.Close()

	s3 := &countingS3Inventory{stubS3Inventory: stubS3Inventory{
		buckets: []models.AwsS3Bucket{{Name: "demo-bucket"}},
	}}
	ec2 := &countingEC2Inventory{stubEC2Inventory: stubEC2Inventory{
		regions: []string{"us-east-1"},
	}}
	lambda := &countingLambdaInventory{}

	service := New(
		settings,
		dataStore,
		discovery.New(settings, func(command string) (string, error) {
			if command == "aws" {
				return "/usr/bin/aws", nil
			}
			return "", nil
		}),
		s3,
		ec2,
		lambda,
		stubDynamoDBInventory{},
		stubSQSInventory{},
		stubSNSInventory{},
		stubRDSInventory{},
		stubECSInventory{},
		stubEKSInventory{},
		stubCloudFormationInventory{},
		stubEventBridgeInventory{},
		stubRoute53Inventory{},
		stubElbv2Inventory{},
		stubApiGatewayInventory{},
		stubSecretsManagerInventory{},
		stubLogsInventory{},
		stubIAMInventory{},
		stubAzureInventory{},
		stubDockerRuntime{},
	)
	service.now = func() time.Time { return time.Now().UTC() }

	ctx := context.Background()
	for _, step := range []struct {
		method string
		params []byte
	}{
		{"session.selectProvider", []byte(`{"providerId":"aws"}`)},
		{"session.selectProfile", []byte(`{"providerId":"aws","profileId":"sandbox"}`)},
		{"session.selectAuthMethod", []byte(`{"authMethod":"cli"}`)},
		{"session.lock", nil},
	} {
		if _, err := service.Handle(ctx, step.method, step.params, nil); err != nil {
			t.Fatalf("%s: %v", step.method, err)
		}
	}

	result, err := service.Handle(ctx, "aws.inventory.get", []byte(`{"scope":"s3"}`), nil)
	if err != nil {
		t.Fatalf("aws.inventory.get: %v", err)
	}
	workspace, ok := result.(models.WorkspaceSnapshot)
	if !ok {
		t.Fatalf("expected WorkspaceSnapshot, got %T", result)
	}
	if s3.listBuckets.Load() == 0 {
		t.Fatal("expected S3 enricher on scoped aws.inventory.get")
	}
	if ec2.listRegions.Load() != 0 {
		t.Fatalf("expected EC2 enricher to be skipped, listRegions=%d", ec2.listRegions.Load())
	}
	if lambda.listFunctions.Load() != 0 {
		t.Fatalf("expected Lambda enricher to be skipped, listFunctions=%d", lambda.listFunctions.Load())
	}
	if len(workspace.S3Buckets) != 1 {
		t.Fatalf("expected S3 inventory on scoped aws.inventory.get, got %+v", workspace.S3Buckets)
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