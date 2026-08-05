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

type jobContractRDSInventory struct {
	instances []models.AwsRdsInstance
}

func (inventory jobContractRDSInventory) ListInstances(
	context.Context,
	models.ProfileSummary,
	string,
) ([]models.AwsRdsInstance, error) {
	return append([]models.AwsRdsInstance(nil), inventory.instances...), nil
}

func (inventory jobContractRDSInventory) DescribeInstance(
	_ context.Context,
	_ models.ProfileSummary,
	_ string,
	instanceID string,
) (models.AwsRdsInstance, error) {
	for _, instance := range inventory.instances {
		if instance.DBInstanceIdentifier == instanceID {
			return instance, nil
		}
	}
	return models.AwsRdsInstance{}, nil
}

func (jobContractRDSInventory) StartDBInstance(context.Context, models.ProfileSummary, string, string) error {
	return nil
}

func (jobContractRDSInventory) StopDBInstance(context.Context, models.ProfileSummary, string, string) error {
	return nil
}

func (jobContractRDSInventory) RebootDBInstance(context.Context, models.ProfileSummary, string, string) error {
	return nil
}

func TestAWSLifecycleJobUpdatedResultRemainsFullWorkspaceSnapshot(t *testing.T) {
	tests := []struct {
		name               string
		method             string
		params             string
		selectedResourceID func(models.WorkspaceSnapshot) string
	}{
		{
			name:   "EC2",
			method: "aws.ec2.invokeAction",
			params: `{"action":"reboot","instanceId":"i-contract"}`,
			selectedResourceID: func(workspace models.WorkspaceSnapshot) string {
				return workspace.SelectedEC2InstanceID
			},
		},
		{
			name:   "RDS",
			method: "aws.rds.startInstance",
			params: `{"instanceId":"db-contract"}`,
			selectedResourceID: func(workspace models.WorkspaceSnapshot) string {
				return workspace.SelectedRDSInstanceID
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			service := newAWSJobContractService(t)
			ctx := context.Background()
			if _, err := service.Handle(ctx, "session.lock", nil, nil); err != nil {
				t.Fatalf("expected session.lock to succeed, got %v", err)
			}
			if _, err := service.Handle(ctx, "session.setWriteMode", []byte(`{"enabled":true}`), nil); err != nil {
				t.Fatalf("expected session.setWriteMode to succeed, got %v", err)
			}

			notifier := recordingNotifier{events: make(chan models.JobStatus, 8)}
			result, err := service.Handle(ctx, test.method, []byte(test.params), notifier)
			if err != nil {
				t.Fatalf("expected %s to queue a job, got %v", test.method, err)
			}
			if queued, ok := result.(models.JobStatus); !ok || queued.Status != "queued" {
				t.Fatalf("expected queued job status, got %#v", result)
			}

			completed := waitForJobStatus(t, notifier.events, "completed")
			workspace, ok := completed.Result.(models.WorkspaceSnapshot)
			if !ok {
				t.Fatalf("expected completed job.updated.result to be models.WorkspaceSnapshot, got %T", completed.Result)
			}
			if workspace.Provider == nil || workspace.Provider.ProviderID != "aws" {
				t.Fatalf("expected full workspace provider identity, got %+v", workspace.Provider)
			}
			if workspace.Profile == nil || workspace.Profile.ProfileID != "sandbox" {
				t.Fatalf("expected full workspace profile identity, got %+v", workspace.Profile)
			}
			if len(workspace.S3Buckets) != 1 || workspace.S3Buckets[0].Name != "contract-bucket" {
				t.Fatalf("expected unrelated S3 inventory in completed workspace, got %+v", workspace.S3Buckets)
			}
			if len(workspace.EC2Instances) != 1 || workspace.EC2Instances[0].InstanceID != "i-contract" {
				t.Fatalf("expected EC2 inventory in completed workspace, got %+v", workspace.EC2Instances)
			}
			if len(workspace.RDSInstances) != 1 || workspace.RDSInstances[0].DBInstanceIdentifier != "db-contract" {
				t.Fatalf("expected RDS inventory in completed workspace, got %+v", workspace.RDSInstances)
			}
			if selected := test.selectedResourceID(workspace); selected == "" {
				t.Fatal("expected completed workspace to preserve the lifecycle target selection")
			}
		})
	}
}

func newAWSJobContractService(t *testing.T) *Service {
	t.Helper()

	home := filepath.Join(t.TempDir(), "home")
	mustWriteFile(
		t,
		filepath.Join(home, ".aws", "config"),
		"[profile sandbox]\nregion = us-east-1\nendpoint_url = http://192.168.50.168:4566\ncloudsprocket_allow_writes = true\n",
	)
	mustWriteFile(
		t,
		filepath.Join(home, ".aws", "credentials"),
		"[sandbox]\naws_access_key_id = AKIAEXAMPLE\naws_secret_access_key = secret\n",
	)

	settings := config.FromEnv(map[string]string{}, "linux", home)
	if err := settings.EnsureRuntimeDirs(); err != nil {
		t.Fatalf("expected runtime directories to be created, got %v", err)
	}
	dataStore, err := store.Open(settings.DatabasePath)
	if err != nil {
		t.Fatalf("expected sqlite store to open, got %v", err)
	}
	t.Cleanup(func() {
		_ = dataStore.Close()
	})

	service := NewFromDeps(Deps{
		Settings: settings,
		Store:    dataStore,
		Discovery: discovery.New(settings, func(command string) (string, error) {
			if command == "aws" {
				return "/usr/bin/aws", nil
			}
			return "", nil
		}),
		S3: &stubS3Inventory{
			buckets: []models.AwsS3Bucket{{Name: "contract-bucket"}},
			objects: map[string][]models.AwsS3Object{},
		},
		EC2: &stubEC2Inventory{
			regions: []string{"us-east-1"},
			instances: map[string][]models.AwsEc2Instance{
				"us-east-1": {{InstanceID: "i-contract", State: "running"}},
			},
		},
		Lambda:         stubLambdaInventory{},
		DynamoDB:       stubDynamoDBInventory{},
		SQS:            stubSQSInventory{},
		SNS:            stubSNSInventory{},
		RDS:            jobContractRDSInventory{instances: []models.AwsRdsInstance{{DBInstanceIdentifier: "db-contract", Status: "available"}}},
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
		Docker:         stubDockerRuntime{},
	})
	service.now = func() time.Time {
		return time.Date(2026, 7, 26, 12, 0, 0, 0, time.UTC)
	}
	return service
}
