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

func TestNormaliseWafPolicyMode(t *testing.T) {
	cases := map[string]struct {
		want string
		ok   bool
	}{
		"prevention": {"Prevention", true},
		"Prevention": {"Prevention", true},
		" detection": {"Detection", true},
		"DETECTION":  {"Detection", true},
		"":           {"", false},
		"Prevention --subscription x": {"", false},
		"audit":                       {"", false},
	}
	for input, expect := range cases {
		got, err := normaliseWafPolicyMode(input)
		if expect.ok && (err != nil || got != expect.want) {
			t.Fatalf("normaliseWafPolicyMode(%q) = %q, %v; want %q, nil", input, got, err, expect.want)
		}
		if !expect.ok && err == nil {
			t.Fatalf("normaliseWafPolicyMode(%q) = %q, nil; want error", input, got)
		}
	}
}

func TestHandleAzureWafSelectPolicyReturnsWorkspaceSnapshot(t *testing.T) {
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
	if _, err := service.Handle(ctx, "session.selectProvider", []byte(`{"providerId":"azure"}`), nil); err != nil {
		t.Fatalf("selectProvider: %v", err)
	}
	if _, err := service.Handle(ctx, "session.selectProfile", []byte(`{"providerId":"azure","profileId":"sub-001"}`), nil); err != nil {
		t.Fatalf("selectProfile: %v", err)
	}
	if _, err := service.Handle(ctx, "session.selectAuthMethod", []byte(`{"authMethod":"cli"}`), nil); err != nil {
		t.Fatalf("selectAuthMethod: %v", err)
	}
	if _, err := service.Handle(ctx, "session.lock", nil, nil); err != nil {
		t.Fatalf("session.lock: %v", err)
	}

	result, err := service.Handle(ctx, "azure.waf.selectPolicy", []byte(`{"policyName":"demo-waf"}`), nil)
	if err != nil {
		t.Fatalf("azure.waf.selectPolicy: %v", err)
	}
	workspace, ok := result.(models.WorkspaceSnapshot)
	if !ok {
		t.Fatalf("expected WorkspaceSnapshot, got %T", result)
	}
	if workspace.Provider == nil || workspace.Provider.ProviderID != "azure" {
		t.Fatalf("expected azure provider on workspace, got %+v", workspace.Provider)
	}
	if workspace.Profile == nil || workspace.Profile.ProfileID != "sub-001" {
		t.Fatalf("expected azure profile on workspace, got %+v", workspace.Profile)
	}
	if workspace.SelectedAzureWafPolicy != "demo-waf" {
		t.Fatalf("selected policy = %q, want demo-waf", workspace.SelectedAzureWafPolicy)
	}
	if len(workspace.AzureWafPolicies) == 0 {
		t.Fatal("expected WAF policies to remain populated after policy selection")
	}
	if workspace.AzureWafPolicyDetail == nil || workspace.AzureWafPolicyDetail.Name != "demo-waf" {
		t.Fatalf("expected policy detail after selection, got %+v", workspace.AzureWafPolicyDetail)
	}
}

func TestHandleAzureWafRefreshReturnsPolicyDetail(t *testing.T) {
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

	result, err := service.Handle(ctx, "azure.waf.refresh", nil, nil)
	if err != nil {
		t.Fatalf("azure.waf.refresh: %v", err)
	}
	workspace, ok := result.(models.WorkspaceSnapshot)
	if !ok {
		t.Fatalf("expected WorkspaceSnapshot, got %T", result)
	}
	if workspace.AzureWafPolicyDetail == nil || workspace.AzureWafPolicyDetail.Name != "demo-waf" {
		t.Fatalf("expected policy detail after refresh, got %+v", workspace.AzureWafPolicyDetail)
	}
}