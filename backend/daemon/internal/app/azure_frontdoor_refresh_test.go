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

func TestHandleAzureFrontDoorRefreshReturnsTopology(t *testing.T) {
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")
	mustWriteFile(
		t,
		filepath.Join(home, ".azure", "azureProfile.json"),
		`{"subscriptions":[{"id":"sub-001","name":"Marketing","tenantId":"tenant-123","user":{"name":"ali@example.com"}}]}`,
	)

	settings := config.FromEnv(map[string]string{}, "linux", home)
	if err := settings.EnsureRuntimeDirs(); err != nil {
		t.Fatalf("expected runtime dirs to be created, got %v", err)
	}

	dataStore, err := store.Open(settings.DatabasePath)
	if err != nil {
		t.Fatalf("expected sqlite store to open, got %v", err)
	}
	defer dataStore.Close()

	discoveryService := discovery.New(settings, func(command string) (string, error) {
		if command == "az" {
			return "/usr/bin/az", nil
		}
		return "", nil
	})
	service := New(
		settings,
		dataStore,
		discoveryService,
		&stubS3Inventory{},
		&stubEC2Inventory{},
		stubLambdaInventory{},
		stubDynamoDBInventory{},
		stubSQSInventory{},
		stubSNSInventory{},
		stubRDSInventory{},
		stubECSInventory{},
		stubApiGatewayInventory{},
		stubLogsInventory{},
		stubIAMInventory{},
		stubAzureInventory{},
		stubDockerRuntime{},
	)

	ctx := context.Background()
	for _, step := range []struct {
		method string
		params []byte
	}{
		{"session.selectProvider", []byte(`{"providerId":"azure"}`)},
		{"session.selectProfile", []byte(`{"providerId":"azure","profileId":"sub-001"}`)},
		{"session.selectAuthMethod", []byte(`{"authMethod":"cli"}`)},
		{"session.lock", nil},
	} {
		if _, err := service.Handle(ctx, step.method, step.params, nil); err != nil {
			t.Fatalf("%s: %v", step.method, err)
		}
	}

	result, err := service.Handle(ctx, "azure.frontDoor.refresh", nil, nil)
	if err != nil {
		t.Fatalf("azure.frontDoor.refresh: %v", err)
	}
	workspace, ok := result.(models.WorkspaceSnapshot)
	if !ok {
		t.Fatalf("expected WorkspaceSnapshot, got %T", result)
	}
	if len(workspace.AzureFrontDoorProfiles) == 0 {
		t.Fatal("expected Front Door profiles after refresh")
	}
	if len(workspace.AzureFrontDoorEndpoints) == 0 {
		t.Fatal("expected Front Door endpoints after refresh")
	}
	if workspace.AzureFrontDoorProfiles[0].Name != "demo-afd" {
		t.Fatalf("profile = %+v", workspace.AzureFrontDoorProfiles[0])
	}
}