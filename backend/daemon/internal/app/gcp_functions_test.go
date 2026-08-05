// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
)

type stubGcpFunctionsInventory struct {
	functions  []models.GcpCloudFunction
	err        error
	callErr    error
	callResult models.GcpCloudFunctionInvokeResult
	callCalls  int
	lastName   string
	lastRegion string
	lastGen    string
	lastData   string
}

func (s *stubGcpFunctionsInventory) ListFunctions(context.Context, models.ProfileSummary) ([]models.GcpCloudFunction, error) {
	if s.err != nil {
		return nil, s.err
	}
	return append([]models.GcpCloudFunction(nil), s.functions...), nil
}

func (s *stubGcpFunctionsInventory) CallFunction(
	_ context.Context,
	_ models.ProfileSummary,
	name string,
	region string,
	generation string,
	data string,
) (models.GcpCloudFunctionInvokeResult, error) {
	s.callCalls++
	s.lastName = name
	s.lastRegion = region
	s.lastGen = generation
	s.lastData = data
	if s.callErr != nil {
		return models.GcpCloudFunctionInvokeResult{}, s.callErr
	}
	if s.callResult.Name != "" {
		return s.callResult, nil
	}
	return models.GcpCloudFunctionInvokeResult{
		Name:       name,
		Region:     region,
		Generation: generation,
		Body:       `{"ok":true}`,
	}, nil
}

func gcpFunctionsTestService(t *testing.T, inv *stubGcpFunctionsInventory) *Service {
	t.Helper()
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")
	mustWriteFile(
		t,
		filepath.Join(home, ".config", "gcloud", "configurations", "config_default"),
		"[core]\naccount = ali@example.com\nproject = platform-prod\n",
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
		if command == "gcloud" {
			return "/usr/bin/gcloud", nil
		}
		return "", nil
	})

	return NewFromDeps(Deps{
		Settings:     settings,
		Store:        dataStore,
		Discovery:    discoveryService,
		GcpFunctions: inv,
		Docker:       stubDockerRuntime{},
	})
}

func TestEnrichGcpFunctionsInventorySuccess(t *testing.T) {
	inv := &stubGcpFunctionsInventory{
		functions: []models.GcpCloudFunction{
			{Name: "alpha", Region: "us-central1", Runtime: "nodejs20"},
			{Name: "zeta", Region: "europe-west1", Runtime: "python311"},
		},
	}
	service := &Service{
		gcpFunctions: inv,
		preferences:  defaultServicePreferences(),
	}
	workspace := models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "gcp"},
		Profile:  &models.ProfileSummary{ProfileID: "default"},
	}
	service.enrichGcpFunctionsInventory(&workspace, models.SessionSnapshot{}, nil)

	if len(workspace.GcpFunctions) != 2 {
		t.Fatalf("functions = %+v", workspace.GcpFunctions)
	}
	if !strings.Contains(workspace.GcpFunctionsStatusMessage, "Loaded 2") {
		t.Fatalf("status = %q", workspace.GcpFunctionsStatusMessage)
	}
}

func TestEnrichGcpFunctionsInventorySurfacesListError(t *testing.T) {
	inv := &stubGcpFunctionsInventory{err: errors.New("gcloud not authenticated")}
	service := &Service{
		gcpFunctions: inv,
		preferences:  defaultServicePreferences(),
	}
	workspace := models.WorkspaceSnapshot{
		Provider:     &models.ProviderSummary{ProviderID: "gcp"},
		Profile:      &models.ProfileSummary{ProfileID: "default"},
		GcpFunctions: []models.GcpCloudFunction{},
	}
	service.enrichGcpFunctionsInventory(&workspace, models.SessionSnapshot{}, nil)

	if len(workspace.GcpFunctions) != 0 {
		t.Fatalf("functions = %+v, want empty on error", workspace.GcpFunctions)
	}
	if !strings.Contains(workspace.GcpFunctionsStatusMessage, "Could not list Cloud Functions") {
		t.Fatalf("status = %q", workspace.GcpFunctionsStatusMessage)
	}
	if !strings.Contains(workspace.GcpFunctionsStatusMessage, "gcloud not authenticated") {
		t.Fatalf("status missing detail: %q", workspace.GcpFunctionsStatusMessage)
	}
}

func TestEnrichGcpFunctionsInventorySkipsWhenDisabled(t *testing.T) {
	inv := &stubGcpFunctionsInventory{
		functions: []models.GcpCloudFunction{{Name: "hidden"}},
	}
	service := &Service{
		gcpFunctions: inv,
		preferences: models.ServicePreferences{
			DisabledServices: map[string][]string{
				"gcp": {"gcp-functions"},
			},
		},
	}
	workspace := models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "gcp"},
		Profile:  &models.ProfileSummary{ProfileID: "default"},
	}
	service.enrichGcpFunctionsInventory(&workspace, models.SessionSnapshot{}, nil)
	if len(workspace.GcpFunctions) != 0 {
		t.Fatalf("functions = %+v, want empty when disabled", workspace.GcpFunctions)
	}
}

func TestHandleGcpFunctionsCallRequiresWriteMode(t *testing.T) {
	inv := &stubGcpFunctionsInventory{
		functions: []models.GcpCloudFunction{
			{Name: "hello-http", Region: "us-central1", Generation: "2nd gen"},
		},
	}
	service := gcpFunctionsTestService(t, inv)
	lockGcpWorkspace(t, service)

	_, err := service.Handle(context.Background(), "gcp.functions.call", []byte(`{
"name":"hello-http","region":"us-central1","generation":"2nd gen","data":"{}"
}`), nil)
	if err == nil {
		t.Fatal("expected write mode error")
	}
	if !strings.Contains(err.Error(), "write mode") {
		t.Fatalf("error = %v", err)
	}
	if inv.callCalls != 0 {
		t.Fatalf("callCalls = %d, want 0", inv.callCalls)
	}
}

func TestHandleGcpFunctionsCallWithWriteMode(t *testing.T) {
	inv := &stubGcpFunctionsInventory{
		functions: []models.GcpCloudFunction{
			{Name: "hello-http", Region: "us-central1", Generation: "2nd gen"},
		},
	}
	service := gcpFunctionsTestService(t, inv)
	lockGcpWorkspace(t, service)
	if _, err := service.Handle(context.Background(), "session.setWriteMode", []byte(`{"enabled":true}`), nil); err != nil {
		t.Fatalf("setWriteMode: %v", err)
	}

	result, err := service.Handle(context.Background(), "gcp.functions.call", []byte(`{
"name":"hello-http","region":"us-central1","generation":"2nd gen","data":"{\"name\":\"world\"}"
}`), nil)
	if err != nil {
		t.Fatalf("call: %v", err)
	}
	if inv.callCalls != 1 {
		t.Fatalf("callCalls = %d", inv.callCalls)
	}
	if inv.lastName != "hello-http" || inv.lastRegion != "us-central1" || inv.lastGen != "2nd gen" {
		t.Fatalf("call args name=%q region=%q gen=%q", inv.lastName, inv.lastRegion, inv.lastGen)
	}
	if inv.lastData != `{"name":"world"}` {
		t.Fatalf("data = %q", inv.lastData)
	}
	payload, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("result type %T", result)
	}
	invoked, ok := payload["result"].(models.GcpCloudFunctionInvokeResult)
	if !ok {
		t.Fatalf("result payload type %T", payload["result"])
	}
	if invoked.Body != `{"ok":true}` {
		t.Fatalf("body = %q", invoked.Body)
	}
}

func TestHandleGcpFunctionsSelectFunctionPersistsSession(t *testing.T) {
	inv := &stubGcpFunctionsInventory{
		functions: []models.GcpCloudFunction{
			{Name: "hello-http", Region: "us-central1", Generation: "2nd gen"},
		},
	}
	service := gcpFunctionsTestService(t, inv)
	lockGcpWorkspace(t, service)

	result, err := service.Handle(context.Background(), "gcp.functions.selectFunction", []byte(`{
"name":"hello-http","region":"us-central1"
}`), nil)
	if err != nil {
		t.Fatalf("selectFunction: %v", err)
	}
	workspace, ok := result.(models.WorkspaceSnapshot)
	if !ok {
		t.Fatalf("result type %T", result)
	}
	if workspace.SelectedGcpFunction != "us-central1/hello-http" {
		t.Fatalf("selected = %q", workspace.SelectedGcpFunction)
	}
	loaded, ok, err := service.store.LoadSession(context.Background())
	if err != nil || !ok {
		t.Fatalf("LoadSession ok=%v err=%v", ok, err)
	}
	if loaded.SelectedGcpFunction != "us-central1/hello-http" {
		t.Fatalf("session selected = %q", loaded.SelectedGcpFunction)
	}
}
