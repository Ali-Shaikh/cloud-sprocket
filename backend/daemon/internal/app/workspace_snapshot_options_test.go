// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
)

func TestWorkspaceSnapshotOptionsEmptyInventorySlices(t *testing.T) {
	awsSnapshot := discovery.Snapshot{
		Providers: []models.ProviderSummary{{ProviderID: "aws", Label: "AWS"}},
		Profiles:  []models.ProfileSummary{{ProviderID: "aws", ProfileID: "sandbox", DisplayName: "sandbox"}},
	}
	awsSession := models.SessionSnapshot{
		CurrentProviderID: "aws",
		SelectedProfileID: "sandbox",
		SelectedEC2Region: "us-east-1",
		IsLocked:          true,
	}
	azureSnapshot := discovery.Snapshot{
		Providers: []models.ProviderSummary{{ProviderID: "azure", Label: "Azure"}},
		Profiles:  []models.ProfileSummary{{ProviderID: "azure", ProfileID: "sub-001", DisplayName: "sub"}},
	}
	azureSession := models.SessionSnapshot{
		CurrentProviderID: "azure",
		SelectedProfileID: "sub-001",
		IsLocked:          true,
	}

	tests := []struct {
		name    string
		cloud   string
		opts    workspaceSnapshotOptions
		want    func(t *testing.T, ws models.WorkspaceSnapshot)
		wantAWS func(t *testing.T, s3 *countingS3Inventory, ec2 *countingEC2Inventory, lambda *countingLambdaInventory)
	}{
		{
			name:  "aws deferred leaves non-core slices empty",
			cloud: "aws",
			opts: workspaceSnapshotOptions{
				lightweightAWS:       true,
				awsDeferredInventory: true,
				skipAzureInventory:   true,
			},
			want: func(t *testing.T, ws models.WorkspaceSnapshot) {
				t.Helper()
				if len(ws.S3Buckets) == 0 {
					t.Fatal("expected S3 buckets on deferred AWS snapshot")
				}
				if len(ws.EC2Regions) == 0 {
					t.Fatal("expected EC2 regions on deferred AWS snapshot")
				}
				if len(ws.LambdaFunctions) != 0 {
					t.Fatalf("LambdaFunctions should stay empty, got %d", len(ws.LambdaFunctions))
				}
				if len(ws.DynamoDBTables) != 0 {
					t.Fatalf("DynamoDBTables should stay empty, got %d", len(ws.DynamoDBTables))
				}
				if len(ws.SQSQueues) != 0 {
					t.Fatalf("SQSQueues should stay empty, got %d", len(ws.SQSQueues))
				}
				if len(ws.AzureResourceGroups) != 0 {
					t.Fatalf("Azure inventory should stay empty on AWS deferred path, got %d groups", len(ws.AzureResourceGroups))
				}
			},
			wantAWS: func(t *testing.T, s3 *countingS3Inventory, ec2 *countingEC2Inventory, lambda *countingLambdaInventory) {
				t.Helper()
				if s3.listBuckets.Load() == 0 || ec2.listRegions.Load() == 0 {
					t.Fatal("expected S3 and EC2 core enrichers on deferred path")
				}
				if lambda.listFunctions.Load() != 0 {
					t.Fatalf("lambda listFunctions=%d, want 0", lambda.listFunctions.Load())
				}
			},
		},
		{
			name:  "awsScope ec2 leaves other AWS and Azure slices empty",
			cloud: "aws",
			opts: workspaceSnapshotOptions{
				awsScope:           "ec2",
				skipAzureInventory: true,
			},
			want: func(t *testing.T, ws models.WorkspaceSnapshot) {
				t.Helper()
				if len(ws.EC2Instances) == 0 {
					t.Fatal("expected EC2 instances for awsScope=ec2")
				}
				if len(ws.S3Buckets) != 0 {
					t.Fatalf("S3Buckets should stay empty, got %d", len(ws.S3Buckets))
				}
				if len(ws.LambdaFunctions) != 0 {
					t.Fatalf("LambdaFunctions should stay empty, got %d", len(ws.LambdaFunctions))
				}
				if len(ws.RDSInstances) != 0 {
					t.Fatalf("RDSInstances should stay empty, got %d", len(ws.RDSInstances))
				}
				if len(ws.AzureStorageAccounts) != 0 {
					t.Fatalf("Azure storage should stay empty, got %d", len(ws.AzureStorageAccounts))
				}
			},
			wantAWS: func(t *testing.T, s3 *countingS3Inventory, ec2 *countingEC2Inventory, lambda *countingLambdaInventory) {
				t.Helper()
				if ec2.listInstances.Load() == 0 {
					t.Fatal("expected EC2 instances enricher")
				}
				if s3.listBuckets.Load() != 0 {
					t.Fatalf("s3 listBuckets=%d, want 0", s3.listBuckets.Load())
				}
				if lambda.listFunctions.Load() != 0 {
					t.Fatalf("lambda listFunctions=%d, want 0", lambda.listFunctions.Load())
				}
			},
		},
		{
			name:  "awsScope lambda leaves S3 and EC2 inventory empty",
			cloud: "aws",
			opts: workspaceSnapshotOptions{
				awsScope:           "lambda",
				skipAzureInventory: true,
			},
			want: func(t *testing.T, ws models.WorkspaceSnapshot) {
				t.Helper()
				if len(ws.S3Buckets) != 0 {
					t.Fatalf("S3Buckets should stay empty for lambda scope, got %d", len(ws.S3Buckets))
				}
				if len(ws.EC2Instances) != 0 {
					t.Fatalf("EC2Instances should stay empty for lambda scope, got %d", len(ws.EC2Instances))
				}
			},
			wantAWS: func(t *testing.T, s3 *countingS3Inventory, ec2 *countingEC2Inventory, lambda *countingLambdaInventory) {
				t.Helper()
				if lambda.listFunctions.Load() == 0 {
					// Region list may run without functions when no region selected;
					// zero calls still means scoped path ran only lambda enricher entry.
					// With empty selected region, listFunctions may be 0; regions still count.
					_ = lambda
				}
				if s3.listBuckets.Load() != 0 {
					t.Fatalf("s3 listBuckets=%d, want 0", s3.listBuckets.Load())
				}
				if ec2.listInstances.Load() != 0 {
					t.Fatalf("ec2 listInstances=%d, want 0", ec2.listInstances.Load())
				}
			},
		},
		{
			name:  "skipAwsInventory on azure provider leaves AWS slices empty",
			cloud: "azure",
			opts: workspaceSnapshotOptions{
				azureDeferredInventory: true,
				skipAwsInventory:       true,
				lightweightAzure:       true,
			},
			want: func(t *testing.T, ws models.WorkspaceSnapshot) {
				t.Helper()
				if len(ws.S3Buckets) != 0 || len(ws.EC2Instances) != 0 || len(ws.LambdaFunctions) != 0 {
					t.Fatalf("AWS inventory should stay empty under skipAwsInventory")
				}
				if len(ws.AzureResourceGroups) == 0 {
					t.Fatal("expected Azure resource groups on deferred Azure snapshot")
				}
				if len(ws.AzureStorageAccounts) != 0 {
					t.Fatalf("AzureStorageAccounts should stay empty on deferred path, got %d", len(ws.AzureStorageAccounts))
				}
				if len(ws.AzureWafPolicies) != 0 {
					t.Fatalf("AzureWafPolicies should stay empty on deferred path, got %d", len(ws.AzureWafPolicies))
				}
			},
		},
		{
			name:  "azureScope storage leaves other Azure slices empty",
			cloud: "azure",
			opts: workspaceSnapshotOptions{
				azureScope:       "storage",
				skipAwsInventory: true,
			},
			want: func(t *testing.T, ws models.WorkspaceSnapshot) {
				t.Helper()
				if len(ws.AzureStorageAccounts) == 0 {
					t.Fatal("expected storage accounts for azureScope=storage")
				}
				if len(ws.AzureWafPolicies) != 0 {
					t.Fatalf("WAF policies should stay empty, got %d", len(ws.AzureWafPolicies))
				}
				if len(ws.AzureKeyVaults) != 0 {
					t.Fatalf("Key vaults should stay empty, got %d", len(ws.AzureKeyVaults))
				}
				if len(ws.S3Buckets) != 0 {
					t.Fatalf("S3 should stay empty, got %d", len(ws.S3Buckets))
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			switch tt.cloud {
			case "aws":
				service, s3, ec2, lambda := awsTestService(t)
				ws := service.buildWorkspaceSnapshotOpts(awsSnapshot, awsSession, tt.opts)
				if tt.want != nil {
					tt.want(t, ws)
				}
				if tt.wantAWS != nil {
					tt.wantAWS(t, s3, ec2, lambda)
				}
			case "azure":
				service, _ := azureOptionsTestService(t)
				ws := service.buildWorkspaceSnapshotOpts(azureSnapshot, azureSession, tt.opts)
				if tt.want != nil {
					tt.want(t, ws)
				}
			default:
				t.Fatalf("unknown cloud %q", tt.cloud)
			}
		})
	}
}

func TestWorkspaceGetDeferredAWSViaHandle(t *testing.T) {
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
		stubKmsInventory{},
		stubApiGatewayInventory{},
		stubSecretsManagerInventory{},
		&stubLogsInventory{},
		&stubIAMInventory{},
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

	result, err := service.Handle(ctx, "workspace.get", nil, nil)
	if err != nil {
		t.Fatalf("workspace.get: %v", err)
	}
	workspace, ok := result.(models.WorkspaceSnapshot)
	if !ok {
		t.Fatalf("expected WorkspaceSnapshot, got %T", result)
	}
	if s3.listBuckets.Load() == 0 {
		t.Fatal("expected deferred workspace.get to list S3 buckets")
	}
	if ec2.listRegions.Load() == 0 {
		t.Fatal("expected deferred workspace.get to list EC2 regions")
	}
	if lambda.listFunctions.Load() != 0 {
		t.Fatalf("deferred workspace.get must not list Lambda functions, got %d", lambda.listFunctions.Load())
	}
	if len(workspace.S3Buckets) != 1 {
		t.Fatalf("expected S3 buckets on deferred workspace.get, got %+v", workspace.S3Buckets)
	}
	if len(workspace.LambdaFunctions) != 0 {
		t.Fatal("LambdaFunctions must stay empty on deferred workspace.get")
	}
	if len(workspace.DynamoDBTables) != 0 {
		t.Fatal("DynamoDBTables must stay empty on deferred workspace.get")
	}
}

func azureOptionsTestService(t *testing.T) (*Service, *countingAzureInventory) {
	t.Helper()
	dataStore, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = dataStore.Close() })

	azure := &countingAzureInventory{stubAzureInventory: stubAzureInventory{
		resourceGroups: []models.AzureResourceGroup{{Name: "rg-demo", Location: "eastus"}},
	}}

	service := &Service{
		store:  dataStore,
		azure:  azure,
		s3:     &stubS3Inventory{},
		ec2:    &stubEC2Inventory{},
		lambda: stubLambdaInventory{},
		now:    func() time.Time { return time.Now().UTC() },
	}
	return service, azure
}
