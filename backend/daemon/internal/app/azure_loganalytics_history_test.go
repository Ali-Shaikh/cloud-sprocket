// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
)

func TestLogAnalyticsHistoryUsesRequestedWorkspaceIdentifier(t *testing.T) {
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")
	settings := config.FromEnv(map[string]string{}, "linux", home)
	if err := settings.EnsureRuntimeDirs(); err != nil {
		t.Fatalf("EnsureRuntimeDirs: %v", err)
	}
	dataStore, err := store.Open(settings.DatabasePath)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	defer dataStore.Close()

	service := New(
		settings,
		dataStore,
		discovery.New(settings, func(string) (string, error) { return "", nil }),
		nil,
		nil,
		stubLambdaInventory{},
		stubDynamoDBInventory{},
		stubSQSInventory{},
		stubSNSInventory{},
		stubRDSInventory{},
		stubLogsInventory{},
		stubIAMInventory{},
		stubAzureInventory{},
		stubDockerRuntime{},
	)

	ctx := context.Background()
	requested := "law-platform"
	resolved := "11111111-2222-3333-4444-555555555555"
	service.appendLogAnalyticsHistory(ctx, requested, "AppRequests | take 10", "P1D")

	listFor := func(workspace string) []models.AzureLogAnalyticsHistoryEntry {
		t.Helper()
		payload, err := json.Marshal(map[string]string{"workspace": workspace})
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		result, err := service.Handle(ctx, "azure.logAnalytics.history.list", payload, nil)
		if err != nil {
			t.Fatalf("history.list %q: %v", workspace, err)
		}
		entries, ok := result.([]models.AzureLogAnalyticsHistoryEntry)
		if !ok {
			t.Fatalf("expected []AzureLogAnalyticsHistoryEntry, got %T", result)
		}
		return entries
	}

	if entries := listFor(requested); len(entries) != 1 || entries[0].Query != "AppRequests | take 10" {
		t.Fatalf("history for requested workspace = %+v", entries)
	}
	if entries := listFor(resolved); len(entries) != 0 {
		t.Fatalf("history should not be stored under resolved GUID, got %+v", entries)
	}
}