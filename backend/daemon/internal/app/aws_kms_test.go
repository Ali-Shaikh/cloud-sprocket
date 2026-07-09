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

type countingKmsInventory struct {
	listKeys     atomic.Int32
	listAliases  atomic.Int32
	describeKey  atomic.Int32
	keys         []models.AwsKmsKey
	aliases      []models.AwsKmsAlias
	keyMetadata  map[string]models.AwsKmsKey
}

func (c *countingKmsInventory) ListKeys(context.Context, models.ProfileSummary, string) ([]models.AwsKmsKey, error) {
	c.listKeys.Add(1)
	return c.keys, nil
}

func (c *countingKmsInventory) ListAliases(context.Context, models.ProfileSummary, string) ([]models.AwsKmsAlias, error) {
	c.listAliases.Add(1)
	return c.aliases, nil
}

func (c *countingKmsInventory) DescribeKey(_ context.Context, _ models.ProfileSummary, _ string, keyID string) (models.AwsKmsKey, error) {
	c.describeKey.Add(1)
	return c.keyMetadata[keyID], nil
}

func TestAwsScopedKmsInventoryLoadsKeysAliasesAndMetadata(t *testing.T) {
	dataStore, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = dataStore.Close() })

	keyID := "1234abcd-5678-90ef-ghij-klmnopqrstuv"
	kmsInventory := &countingKmsInventory{
		keys: []models.AwsKmsKey{{
			KeyId: keyID,
			Arn:   "arn:aws:kms:us-east-1:123:key/" + keyID,
		}},
		aliases: []models.AwsKmsAlias{{
			AliasName:   "alias/demo-key",
			AliasArn:    "arn:aws:kms:us-east-1:123:alias/demo-key",
			TargetKeyId: keyID,
		}},
		keyMetadata: map[string]models.AwsKmsKey{
			keyID: {
				KeyId:       keyID,
				Arn:         "arn:aws:kms:us-east-1:123:key/" + keyID,
				Description: "Demo encryption key",
				KeyUsage:    "ENCRYPT_DECRYPT",
				KeyState:    "Enabled",
				KeySpec:     "SYMMETRIC_DEFAULT",
				Origin:      "AWS_KMS",
				Enabled:     true,
			},
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
		elbv2:          stubElbv2Inventory{},
		kms:            kmsInventory,
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
		CurrentProviderID: "aws",
		SelectedProfileID: "sandbox",
		SelectedKmsRegion: "us-east-1",
		SelectedKmsKeyId:  keyID,
		IsLocked:          true,
	}

	workspace := service.buildWorkspaceSnapshotOpts(snapshot, session, workspaceSnapshotOptions{
		awsScope:           "kms",
		skipAzureInventory: true,
	})
	if kmsInventory.listKeys.Load() == 0 {
		t.Fatal("expected KMS ListKeys on scoped enrichment")
	}
	if len(workspace.KmsKeys) != 1 {
		t.Fatalf("expected 1 key, got %+v", workspace.KmsKeys)
	}
	if kmsInventory.listAliases.Load() == 0 {
		t.Fatal("expected KMS ListAliases on scoped enrichment")
	}
	if len(workspace.KmsAliases) != 1 {
		t.Fatalf("expected 1 alias, got %+v", workspace.KmsAliases)
	}
	if kmsInventory.describeKey.Load() == 0 {
		t.Fatal("expected KMS DescribeKey on scoped enrichment with selected key")
	}
	if workspace.KmsKeys[0].Description != "Demo encryption key" {
		t.Fatalf("expected described key metadata, got %+v", workspace.KmsKeys[0])
	}
}