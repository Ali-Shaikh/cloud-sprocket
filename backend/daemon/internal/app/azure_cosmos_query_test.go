// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
)

func newAzureWorkspaceService(t *testing.T) *Service {
	t.Helper()
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
	t.Cleanup(func() { _ = dataStore.Close() })

	discoveryService := discovery.New(settings, func(command string) (string, error) {
		if command == "az" {
			return "/usr/bin/az", nil
		}
		return "", nil
	})
	return New(
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
}

func lockAzureWorkspace(t *testing.T, service *Service) {
	t.Helper()
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
}

func TestHandleAzureCosmosQueryReturnsDocuments(t *testing.T) {
	service := newAzureWorkspaceService(t)
	lockAzureWorkspace(t, service)

	result, err := service.Handle(context.Background(), "azure.cosmos.query", []byte(`{
		"account":"devstoreaccount1",
		"database":"appdb",
		"container":"orders",
		"query":"SELECT * FROM c"
	}`), nil)
	if err != nil {
		t.Fatalf("azure.cosmos.query: %v", err)
	}
	got, ok := result.(models.AzureCosmosQueryResult)
	if !ok {
		t.Fatalf("expected AzureCosmosQueryResult, got %T", result)
	}
	if got.Account != "devstoreaccount1" || got.Database != "appdb" || got.Container != "orders" {
		t.Fatalf("result = %+v", got)
	}
	if len(got.Items) != 1 || got.Items[0].ID != "doc-1" {
		t.Fatalf("items = %+v", got.Items)
	}
}

func TestHandleAzureCosmosQueryUsesSessionSelection(t *testing.T) {
	service := newAzureWorkspaceService(t)
	lockAzureWorkspace(t, service)
	ctx := context.Background()
	for _, step := range []struct {
		method string
		params []byte
	}{
		{"azure.cosmos.selectAccount", []byte(`{"account":"devstoreaccount1"}`)},
		{"azure.cosmos.selectDatabase", []byte(`{"database":"appdb"}`)},
		{"azure.cosmos.selectContainer", []byte(`{"container":"orders"}`)},
	} {
		if _, err := service.Handle(ctx, step.method, step.params, nil); err != nil {
			t.Fatalf("%s: %v", step.method, err)
		}
	}

	result, err := service.Handle(ctx, "azure.cosmos.query", []byte(`{"query":"SELECT c.id FROM c"}`), nil)
	if err != nil {
		t.Fatalf("azure.cosmos.query: %v", err)
	}
	got, ok := result.(models.AzureCosmosQueryResult)
	if !ok {
		t.Fatalf("expected AzureCosmosQueryResult, got %T", result)
	}
	if got.Account != "devstoreaccount1" || got.Database != "appdb" || got.Container != "orders" {
		t.Fatalf("session fallback = %+v", got)
	}
	if got.Query != "SELECT c.id FROM c" {
		t.Fatalf("query = %q", got.Query)
	}
}

func TestHandleAzureCosmosQueryRequiresLockedWorkspace(t *testing.T) {
	service := newAzureWorkspaceService(t)
	_, err := service.Handle(context.Background(), "azure.cosmos.query", []byte(`{
		"account":"devstoreaccount1",
		"database":"appdb",
		"container":"orders",
		"query":"SELECT * FROM c"
	}`), nil)
	if err == nil || !strings.Contains(err.Error(), "locked Azure workspace") {
		t.Fatalf("err = %v", err)
	}
}

func TestHandleAzureCosmosQueryDoesNotRequireWriteMode(t *testing.T) {
	service := newAzureWorkspaceService(t)
	lockAzureWorkspace(t, service)
	params, _ := json.Marshal(map[string]string{
		"account":   "devstoreaccount1",
		"database":  "appdb",
		"container": "orders",
		"query":     "SELECT * FROM c",
	})
	if _, err := service.Handle(context.Background(), "azure.cosmos.query", params, nil); err != nil {
		t.Fatalf("read-only query should not require write mode: %v", err)
	}
}
