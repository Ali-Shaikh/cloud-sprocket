// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"path/filepath"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
)

type facadeContractEmulatorManager struct {
	status models.EmulatorStatusDetail
}

func (m facadeContractEmulatorManager) Status(context.Context) (models.EmulatorStatusDetail, error) {
	return m.status, nil
}

func (m facadeContractEmulatorManager) Start(context.Context, models.EmulatorStartOptions) (models.EmulatorStatusDetail, error) {
	return m.status, nil
}

func (m facadeContractEmulatorManager) Stop(context.Context) (models.EmulatorStatusDetail, error) {
	return m.status, nil
}

func (facadeContractEmulatorManager) Logs(context.Context, int) (models.EmulatorLogSnapshot, error) {
	return models.EmulatorLogSnapshot{}, nil
}

func (facadeContractEmulatorManager) EnsureManagedProfile() error {
	return nil
}

func (facadeContractEmulatorManager) EnsureManagedConfig() error {
	return nil
}

// TestAWSSelectionFacadeReturnsFullWorkspaceSnapshot pins the façade
// contract while internal/app is split into domain services. Existing AWS
// selection RPCs must continue returning the complete workspace model, rather
// than a domain-only response that drops workspace shell or runtime state.
func TestAWSSelectionFacadeReturnsFullWorkspaceSnapshot(t *testing.T) {
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")
	mustWriteFile(t, filepath.Join(home, ".aws", "config"), "[profile sandbox]\nregion = us-east-1\n")
	mustWriteFile(t, filepath.Join(home, ".aws", "credentials"), "[sandbox]\naws_access_key_id = AKIAEXAMPLE\n")

	settings := config.FromEnv(map[string]string{}, "linux", home)
	if err := settings.EnsureRuntimeDirs(); err != nil {
		t.Fatalf("EnsureRuntimeDirs: %v", err)
	}

	dataStore, err := store.Open(settings.DatabasePath)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = dataStore.Close() })

	s3 := &stubS3Inventory{
		buckets: []models.AwsS3Bucket{{Name: "demo-bucket"}},
		objects: map[string][]models.AwsS3Object{
			"demo-bucket": {{Key: "readme.txt", Size: "42 B"}},
		},
	}
	docker := stubDockerRuntime{
		snapshot: models.DockerRuntimeSnapshot{
			Reachable:     true,
			Host:          "unix:///var/run/docker.sock",
			HostSource:    "test",
			ContextName:   "desktop-linux",
			ServerVersion: "28.5.1",
			EngineName:    "docker",
			Summary:       "Docker engine is reachable.",
			Details:       []models.DetailField{{Label: "Host", Value: "unix:///var/run/docker.sock"}},
		},
		resources: []models.ManagedDockerResource{{
			ResourceID: "ctr-contract",
			Kind:       "container",
			Name:       "cloudsprocket-localstack",
			State:      "running",
			Owned:      true,
		}},
	}
	localStack := facadeContractEmulatorManager{status: models.EmulatorStatusDetail{
		EmulatorID: "localstack",
		ProviderID: "aws",
		Label:      "LocalStack",
		Kind:       "docker",
		Status:     models.EmulatorStatusRunning,
		Summary:    "LocalStack is running.",
	}}
	azureRuntime := facadeContractEmulatorManager{status: models.EmulatorStatusDetail{
		EmulatorID: "floci-az",
		ProviderID: "azure",
		Label:      "floci-az",
		Kind:       "docker",
		Status:     models.EmulatorStatusStopped,
		Summary:    "floci-az is stopped.",
	}}
	service := NewFromDeps(Deps{
		Settings: settings,
		Store:    dataStore,
		Discovery: discovery.New(settings, func(command string) (string, error) {
			if command == "aws" {
				return "/usr/bin/aws", nil
			}
			return "", nil
		}),
		S3:             s3,
		EC2:            &stubEC2Inventory{regions: []string{"us-east-1"}},
		Lambda:         stubLambdaInventory{},
		DynamoDB:       stubDynamoDBInventory{},
		SQS:            stubSQSInventory{},
		SNS:            stubSNSInventory{},
		RDS:            stubRDSInventory{},
		ECS:            stubECSInventory{},
		EKS:            stubEKSInventory{},
		CloudFormation: stubCloudFormationInventory{},
		EventBridge:    stubEventBridgeInventory{},
		Route53:        stubRoute53Inventory{},
		Elbv2:          stubElbv2Inventory{},
		Kms:            stubKmsInventory{},
		ApiGateway:     stubApiGatewayInventory{},
		SecretsManager: stubSecretsManagerInventory{},
		Logs:           &stubLogsInventory{},
		IAM:            &stubIAMInventory{},
		Azure:          stubAzureInventory{},
		Docker:         docker,
		LocalStack:     localStack,
		AzureRuntime:   azureRuntime,
	})

	ctx := context.Background()
	if _, err := service.Handle(ctx, "session.lock", nil, nil); err != nil {
		t.Fatalf("session.lock: %v", err)
	}

	selectionResult, err := service.Handle(ctx, "aws.s3.selectBucket", []byte(`{"bucketName":"demo-bucket"}`), nil)
	if err != nil {
		t.Fatalf("aws.s3.selectBucket: %v", err)
	}
	selected, ok := selectionResult.(models.WorkspaceSnapshot)
	if !ok {
		t.Fatalf("aws.s3.selectBucket returned %T, want models.WorkspaceSnapshot", selectionResult)
	}
	if selected.SelectedS3BucketName != "demo-bucket" {
		t.Fatalf("selected bucket = %q, want demo-bucket", selected.SelectedS3BucketName)
	}
	if selected.Provider == nil || selected.Provider.ProviderID != "aws" {
		t.Fatalf("expected AWS provider identity, got %+v", selected.Provider)
	}
	if selected.Profile == nil || selected.Profile.ProfileID != "sandbox" {
		t.Fatalf("expected sandbox profile identity, got %+v", selected.Profile)
	}
	if selected.AuthMethod != models.AuthMethodCLI {
		t.Fatalf("auth method = %q, want %q", selected.AuthMethod, models.AuthMethodCLI)
	}
	if selected.RuntimeSettings.DatabasePath != settings.DatabasePath {
		t.Fatalf("runtime database path = %q, want %q", selected.RuntimeSettings.DatabasePath, settings.DatabasePath)
	}
	if len(selected.EnvironmentDiagnostics) == 0 || selected.EnvironmentDiagnostics[0].Label != "Platform" {
		t.Fatalf("expected environment diagnostics, got %+v", selected.EnvironmentDiagnostics)
	}
	if len(selected.LocalConfigArtifacts) != 3 {
		t.Fatalf("local config artifacts = %d, want 3", len(selected.LocalConfigArtifacts))
	}
	if selected.DockerDiagnostics.EngineState != models.DockerEngineStateAvailable ||
		selected.DockerDiagnostics.Host != "unix:///var/run/docker.sock" {
		t.Fatalf("expected available Docker diagnostics, got %+v", selected.DockerDiagnostics)
	}
	if !selected.DockerRuntime.Reachable ||
		selected.DockerRuntime.ServerVersion != "28.5.1" ||
		selected.DockerRuntime.ContextName != "desktop-linux" {
		t.Fatalf("expected fixture Docker runtime, got %+v", selected.DockerRuntime)
	}
	if len(selected.DockerResources) != 1 || selected.DockerResources[0].ResourceID != "ctr-contract" {
		t.Fatalf("expected fixture Docker resource, got %+v", selected.DockerResources)
	}
	if len(selected.EmulatorSummaries) != 2 ||
		selected.EmulatorSummaries[0].EmulatorID != "localstack" ||
		selected.EmulatorSummaries[0].Status != models.EmulatorStatusRunning {
		t.Fatalf("expected fixture emulator summaries, got %+v", selected.EmulatorSummaries)
	}
	if len(selected.ActionCapabilities["s3"]) != 5 ||
		selected.ActionCapabilities["s3"][0].ActionID != "uploadObject" {
		t.Fatalf("expected complete S3 action capabilities, got %+v", selected.ActionCapabilities["s3"])
	}
	if len(selected.S3Objects) != 1 || selected.S3Objects[0].Key != "readme.txt" {
		t.Fatalf("expected selected bucket objects, got %+v", selected.S3Objects)
	}
}
