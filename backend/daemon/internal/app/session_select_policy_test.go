// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
)

// TestSessionSelectRefusesWhileLocked pins architecture F-011: only
// session.unlock closes a locked workspace. selectProvider/selectProfile must
// not clear IsLocked so alternate RPC clients cannot drop a lock without the
// desktop leave-workspace confirmation path (unlock then select).
func TestSessionSelectRefusesWhileLocked(t *testing.T) {
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")

	mustWriteFile(t, filepath.Join(home, ".aws", "config"), "[profile sandbox]\nregion = us-east-1\n")
	mustWriteFile(t, filepath.Join(home, ".aws", "credentials"), "[sandbox]\naws_access_key_id = AKIAEXAMPLE\n")

	settings := config.FromEnv(map[string]string{}, "linux", home)
	if err := settings.EnsureRuntimeDirs(); err != nil {
		t.Fatalf("expected runtime dirs to be created, got %v", err)
	}

	dataStore, err := store.Open(settings.DatabasePath)
	if err != nil {
		t.Fatalf("expected sqlite store to open, got %v", err)
	}
	defer dataStore.Close()

	service := New(
		settings,
		dataStore,
		discovery.New(settings, func(command string) (string, error) {
			if command == "aws" {
				return "/usr/bin/aws", nil
			}
			return "", nil
		}),
		&stubS3Inventory{},
		&stubEC2Inventory{regions: []string{"us-east-1"}},
		stubLambdaInventory{},
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

	ctx := context.Background()
	if _, err := service.Handle(ctx, "session.lock", nil, nil); err != nil {
		t.Fatalf("expected session.lock to succeed, got %v", err)
	}

	_, err = service.Handle(ctx, "session.selectProvider", []byte(`{"providerId":"azure"}`), nil)
	if err == nil {
		t.Fatal("expected session.selectProvider to refuse while locked")
	}
	if !strings.Contains(err.Error(), "session.unlock") {
		t.Fatalf("expected unlock guidance in error, got %v", err)
	}

	_, err = service.Handle(ctx, "session.selectProfile", []byte(`{"providerId":"aws","profileId":"sandbox"}`), nil)
	if err == nil {
		t.Fatal("expected session.selectProfile to refuse while locked")
	}
	if !strings.Contains(err.Error(), "session.unlock") {
		t.Fatalf("expected unlock guidance in error, got %v", err)
	}

	locked, err := service.Handle(ctx, "session.get", nil, nil)
	if err != nil {
		t.Fatalf("session.get: %v", err)
	}
	session := locked.(models.SessionSnapshot)
	if !session.IsLocked {
		t.Fatal("expected session to remain locked after refused selects")
	}

	if _, err := service.Handle(ctx, "session.unlock", nil, nil); err != nil {
		t.Fatalf("expected session.unlock to succeed, got %v", err)
	}
	result, err := service.Handle(ctx, "session.selectProvider", []byte(`{"providerId":"aws"}`), nil)
	if err != nil {
		t.Fatalf("expected selectProvider after unlock to succeed, got %v", err)
	}
	unlocked := result.(models.SessionSnapshot)
	if unlocked.IsLocked {
		t.Fatal("expected session to stay unlocked after selectProvider")
	}
	if unlocked.CurrentProviderID != "aws" {
		t.Fatalf("expected current provider aws, got %q", unlocked.CurrentProviderID)
	}
}
