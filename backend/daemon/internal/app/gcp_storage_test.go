// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
)

type stubGcpStorageInventory struct {
	buckets     []models.GcpStorageBucket
	objects     models.GcpStorageObjectListPage
	err         error
	objectsErr  error
	uploadErr   error
	deleteErr   error
	signErr     error
	signResult  models.GcpStorageSignURLResult
	calls       int
	objectCalls int
	uploadCalls int
	deleteCalls int
	signCalls   int
	lastBucket  string
	lastPrefix  string
	lastToken   string
	lastKey     string
	lastSource  string
	lastSignKey string
	lastSignDur int
}

func (s *stubGcpStorageInventory) ListBuckets(context.Context, models.ProfileSummary) ([]models.GcpStorageBucket, error) {
	s.calls++
	if s.err != nil {
		return nil, s.err
	}
	return append([]models.GcpStorageBucket(nil), s.buckets...), nil
}

func (s *stubGcpStorageInventory) ListObjects(
	_ context.Context,
	_ models.ProfileSummary,
	bucketName string,
	prefix string,
	pageToken string,
) (models.GcpStorageObjectListPage, error) {
	s.objectCalls++
	s.lastBucket = bucketName
	s.lastPrefix = prefix
	s.lastToken = pageToken
	if s.objectsErr != nil {
		return models.GcpStorageObjectListPage{}, s.objectsErr
	}
	return models.GcpStorageObjectListPage{
		Entries:       append([]models.GcpStorageObject(nil), s.objects.Entries...),
		NextPageToken: s.objects.NextPageToken,
		IsTruncated:   s.objects.IsTruncated,
	}, nil
}

func (s *stubGcpStorageInventory) UploadObject(
	_ context.Context,
	_ models.ProfileSummary,
	bucketName string,
	objectKey string,
	sourcePath string,
) (models.GcpStorageUploadResult, error) {
	s.uploadCalls++
	s.lastBucket = bucketName
	s.lastKey = objectKey
	s.lastSource = sourcePath
	if s.uploadErr != nil {
		return models.GcpStorageUploadResult{}, s.uploadErr
	}
	return models.GcpStorageUploadResult{
		BucketName:     bucketName,
		ObjectKey:      objectKey,
		DestinationURI: "gs://" + bucketName + "/" + objectKey,
	}, nil
}

func (s *stubGcpStorageInventory) DeleteObject(
	_ context.Context,
	_ models.ProfileSummary,
	bucketName string,
	objectKey string,
) error {
	s.deleteCalls++
	s.lastBucket = bucketName
	s.lastKey = objectKey
	return s.deleteErr
}

func (s *stubGcpStorageInventory) SignURL(
	_ context.Context,
	_ models.ProfileSummary,
	bucketName string,
	objectKey string,
	durationSeconds int,
) (models.GcpStorageSignURLResult, error) {
	s.signCalls++
	s.lastBucket = bucketName
	s.lastSignKey = objectKey
	s.lastSignDur = durationSeconds
	if s.signErr != nil {
		return models.GcpStorageSignURLResult{}, s.signErr
	}
	if s.signResult.URL != "" {
		return s.signResult, nil
	}
	return models.GcpStorageSignURLResult{
		BucketName:      bucketName,
		ObjectKey:       objectKey,
		URL:             "https://storage.googleapis.com/" + bucketName + "/" + objectKey + "?X-Goog-Signature=mock",
		DurationSeconds: durationSeconds,
		ExpiresAt:       "2026-08-05T12:00:00Z",
	}, nil
}

func TestEnrichGcpStorageInventorySuccess(t *testing.T) {
	inv := &stubGcpStorageInventory{
		buckets: []models.GcpStorageBucket{
			{Name: "alpha", Location: "US"},
			{Name: "beta", Location: "EU"},
		},
	}
	service := &Service{
		gcpStorage:  inv,
		preferences: defaultServicePreferences(),
	}
	workspace := models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "gcp"},
		Profile:  &models.ProfileSummary{ProviderID: "gcp", ProfileID: "default"},
	}
	service.enrichGcpStorageInventory(&workspace, models.SessionSnapshot{}, nil)
	if inv.calls != 1 {
		t.Fatalf("calls = %d", inv.calls)
	}
	if inv.objectCalls != 0 {
		t.Fatalf("objectCalls = %d, want 0 without selected bucket", inv.objectCalls)
	}
	if len(workspace.GcpStorageBuckets) != 2 {
		t.Fatalf("buckets = %+v", workspace.GcpStorageBuckets)
	}
	if !strings.Contains(workspace.GcpStorageStatusMessage, "Select one") {
		t.Fatalf("status = %q", workspace.GcpStorageStatusMessage)
	}
}

func TestEnrichGcpStorageInventoryListsObjectsWhenBucketSelected(t *testing.T) {
	inv := &stubGcpStorageInventory{
		buckets: []models.GcpStorageBucket{{Name: "alpha"}, {Name: "beta"}},
		objects: models.GcpStorageObjectListPage{
			Entries: []models.GcpStorageObject{
				{Key: "folder/", IsFolder: true, Size: "Folder"},
				{Key: "readme.txt", Size: "12 B"},
			},
		},
	}
	service := &Service{
		gcpStorage:  inv,
		preferences: defaultServicePreferences(),
	}
	workspace := models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "gcp"},
		Profile:  &models.ProfileSummary{ProviderID: "gcp", ProfileID: "default"},
	}
	session := models.SessionSnapshot{
		SelectedGcpStorageBucket: "alpha",
		GcpStoragePrefixFilter:   "docs/",
	}
	service.enrichGcpStorageInventory(&workspace, session, nil)
	if inv.objectCalls != 1 {
		t.Fatalf("objectCalls = %d, want 1", inv.objectCalls)
	}
	if inv.lastBucket != "alpha" || inv.lastPrefix != "docs/" {
		t.Fatalf("list args bucket=%q prefix=%q", inv.lastBucket, inv.lastPrefix)
	}
	if workspace.SelectedGcpStorageBucket != "alpha" {
		t.Fatalf("selected = %q", workspace.SelectedGcpStorageBucket)
	}
	if workspace.GcpStoragePrefixFilter != "docs/" {
		t.Fatalf("prefix = %q", workspace.GcpStoragePrefixFilter)
	}
	if len(workspace.GcpStorageObjects) != 2 {
		t.Fatalf("objects = %+v", workspace.GcpStorageObjects)
	}
	if !strings.Contains(workspace.GcpStorageStatusMessage, "1 folder") {
		t.Fatalf("status = %q", workspace.GcpStorageStatusMessage)
	}
}

func TestEnrichGcpStorageInventorySurfacesListError(t *testing.T) {
	inv := &stubGcpStorageInventory{err: errors.New("gcloud not authenticated")}
	service := &Service{
		gcpStorage:  inv,
		preferences: defaultServicePreferences(),
	}
	workspace := models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "gcp", Label: "GCP"},
		Profile: &models.ProfileSummary{
			ProviderID: "gcp",
			ProfileID:  "default",
			Attributes: []models.DetailField{{Label: "Project", Value: "demo"}},
		},
		GcpStorageBuckets: []models.GcpStorageBucket{},
	}
	service.enrichGcpStorageInventory(&workspace, models.SessionSnapshot{}, nil)
	if inv.calls != 1 {
		t.Fatalf("ListBuckets calls = %d, want 1", inv.calls)
	}
	if len(workspace.GcpStorageBuckets) != 0 {
		t.Fatalf("buckets = %+v, want empty on error", workspace.GcpStorageBuckets)
	}
	if !strings.Contains(workspace.GcpStorageStatusMessage, "Could not list Cloud Storage buckets") {
		t.Fatalf("status = %q", workspace.GcpStorageStatusMessage)
	}
	if !strings.Contains(workspace.GcpStorageStatusMessage, "gcloud not authenticated") {
		t.Fatalf("status missing detail: %q", workspace.GcpStorageStatusMessage)
	}
}

func TestEnrichGcpStorageInventorySkipsWhenDisabled(t *testing.T) {
	inv := &stubGcpStorageInventory{
		buckets: []models.GcpStorageBucket{{Name: "hidden"}},
	}
	service := &Service{
		gcpStorage: inv,
		preferences: models.ServicePreferences{
			DisabledServices: map[string][]string{
				"gcp": {"gcp-storage"},
			},
		},
	}
	workspace := models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "gcp"},
		Profile:  &models.ProfileSummary{ProviderID: "gcp", ProfileID: "default"},
	}
	service.enrichGcpStorageInventory(&workspace, models.SessionSnapshot{}, nil)
	if inv.calls != 0 {
		t.Fatalf("ListBuckets calls = %d, want 0 when service disabled", inv.calls)
	}
}

func TestSelectedGcpStorageBucketRequiresListedName(t *testing.T) {
	service := &Service{}
	buckets := []models.GcpStorageBucket{{Name: "alpha"}, {Name: "beta"}}
	if got := service.selectedGcpStorageBucket(models.SessionSnapshot{SelectedGcpStorageBucket: "missing"}, buckets); got != "" {
		t.Fatalf("selected missing = %q, want empty", got)
	}
	if got := service.selectedGcpStorageBucket(models.SessionSnapshot{SelectedGcpStorageBucket: "beta"}, buckets); got != "beta" {
		t.Fatalf("selected = %q, want beta", got)
	}
}

func gcpStorageTestService(t *testing.T, inv *stubGcpStorageInventory) *Service {
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
		Settings:   settings,
		Store:      dataStore,
		Discovery:  discoveryService,
		GcpStorage: inv,
		Docker:     stubDockerRuntime{},
	})
}

func lockGcpWorkspace(t *testing.T, service *Service) {
	t.Helper()
	ctx := context.Background()
	if _, err := service.Handle(ctx, "session.selectProvider", []byte(`{"providerId":"gcp"}`), nil); err != nil {
		t.Fatalf("selectProvider: %v", err)
	}
	if _, err := service.Handle(ctx, "session.selectProfile", []byte(`{"providerId":"gcp","profileId":"default"}`), nil); err != nil {
		t.Fatalf("selectProfile: %v", err)
	}
	if _, err := service.Handle(ctx, "session.selectAuthMethod", []byte(`{"authMethod":"cli"}`), nil); err != nil {
		t.Fatalf("selectAuthMethod: %v", err)
	}
	if _, err := service.Handle(ctx, "session.lock", nil, nil); err != nil {
		t.Fatalf("session.lock: %v", err)
	}
}

func TestHandleGcpStorageUploadRequiresWriteMode(t *testing.T) {
	// Create a real file so path validation passes; write mode must still gate.
	source := filepath.Join(t.TempDir(), "payload.txt")
	mustWriteFile(t, source, "hello")

	inv := &stubGcpStorageInventory{
		buckets: []models.GcpStorageBucket{{Name: "alpha"}},
	}
	service := gcpStorageTestService(t, inv)
	lockGcpWorkspace(t, service)
	if _, err := service.Handle(context.Background(), "gcp.storage.selectBucket", []byte(`{"bucketName":"alpha"}`), nil); err != nil {
		t.Fatalf("selectBucket: %v", err)
	}

	payload, _ := json.Marshal(map[string]string{
		"sourcePath": source,
		"objectKey":  "docs/payload.txt",
	})
	_, err := service.Handle(context.Background(), "gcp.storage.uploadObject", payload, nil)
	if err == nil {
		t.Fatal("expected write mode gate")
	}
	if !strings.Contains(err.Error(), "write mode") {
		t.Fatalf("error = %v, want write mode", err)
	}
	if inv.uploadCalls != 0 {
		t.Fatalf("uploadCalls = %d, want 0", inv.uploadCalls)
	}

	if _, err := service.Handle(context.Background(), "session.setWriteMode", []byte(`{"enabled":true}`), nil); err != nil {
		t.Fatalf("setWriteMode: %v", err)
	}
	result, err := service.Handle(context.Background(), "gcp.storage.uploadObject", payload, nil)
	if err != nil {
		t.Fatalf("uploadObject: %v", err)
	}
	if inv.uploadCalls != 1 {
		t.Fatalf("uploadCalls = %d, want 1", inv.uploadCalls)
	}
	if inv.lastKey != "docs/payload.txt" || inv.lastBucket != "alpha" {
		t.Fatalf("upload target = %s/%s", inv.lastBucket, inv.lastKey)
	}
	response, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("result type %T", result)
	}
	if _, hasWorkspace := response["workspace"]; !hasWorkspace {
		t.Fatalf("response missing workspace: %+v", response)
	}
}

func TestHandleGcpStorageDeleteRequiresWriteMode(t *testing.T) {
	inv := &stubGcpStorageInventory{
		buckets: []models.GcpStorageBucket{{Name: "alpha"}},
		objects: models.GcpStorageObjectListPage{
			Entries: []models.GcpStorageObject{{Key: "docs/readme.txt"}},
		},
	}
	service := gcpStorageTestService(t, inv)
	lockGcpWorkspace(t, service)
	if _, err := service.Handle(context.Background(), "gcp.storage.selectBucket", []byte(`{"bucketName":"alpha"}`), nil); err != nil {
		t.Fatalf("selectBucket: %v", err)
	}

	_, err := service.Handle(context.Background(), "gcp.storage.deleteObject", []byte(`{"objectKey":"docs/readme.txt"}`), nil)
	if err == nil {
		t.Fatal("expected write mode gate")
	}
	if !strings.Contains(err.Error(), "write mode") {
		t.Fatalf("error = %v, want write mode", err)
	}
	if inv.deleteCalls != 0 {
		t.Fatalf("deleteCalls = %d, want 0", inv.deleteCalls)
	}

	if _, err := service.Handle(context.Background(), "session.setWriteMode", []byte(`{"enabled":true}`), nil); err != nil {
		t.Fatalf("setWriteMode: %v", err)
	}
	if _, err := service.Handle(context.Background(), "gcp.storage.deleteObject", []byte(`{"objectKey":"docs/readme.txt"}`), nil); err != nil {
		t.Fatalf("deleteObject: %v", err)
	}
	if inv.deleteCalls != 1 || inv.lastKey != "docs/readme.txt" {
		t.Fatalf("deleteCalls=%d lastKey=%q", inv.deleteCalls, inv.lastKey)
	}
}

func TestHandleGcpStorageSelectBucketPersistsSession(t *testing.T) {
	inv := &stubGcpStorageInventory{
		buckets: []models.GcpStorageBucket{{Name: "alpha"}},
		objects: models.GcpStorageObjectListPage{
			Entries: []models.GcpStorageObject{{Key: "a.txt"}},
		},
	}
	service := gcpStorageTestService(t, inv)
	lockGcpWorkspace(t, service)

	result, err := service.Handle(context.Background(), "gcp.storage.selectBucket", []byte(`{"bucketName":"alpha"}`), nil)
	if err != nil {
		t.Fatalf("selectBucket: %v", err)
	}
	workspace, ok := result.(models.WorkspaceSnapshot)
	if !ok {
		t.Fatalf("result type %T", result)
	}
	if workspace.SelectedGcpStorageBucket != "alpha" {
		t.Fatalf("workspace selected = %q", workspace.SelectedGcpStorageBucket)
	}
	if len(workspace.GcpStorageObjects) != 1 || workspace.GcpStorageObjects[0].Key != "a.txt" {
		t.Fatalf("objects = %+v", workspace.GcpStorageObjects)
	}
	if inv.objectCalls < 1 {
		t.Fatalf("expected object list after select, calls=%d", inv.objectCalls)
	}

	loaded, ok, err := service.store.LoadSession(context.Background())
	if err != nil || !ok {
		t.Fatalf("LoadSession ok=%v err=%v", ok, err)
	}
	if loaded.SelectedGcpStorageBucket != "alpha" {
		t.Fatalf("session selected = %q", loaded.SelectedGcpStorageBucket)
	}
	if loaded.GcpStoragePrefixFilter != "" {
		t.Fatalf("prefix should clear on bucket select, got %q", loaded.GcpStoragePrefixFilter)
	}
}

func TestHandleGcpStorageSetPrefixFilter(t *testing.T) {
	inv := &stubGcpStorageInventory{
		buckets: []models.GcpStorageBucket{{Name: "alpha"}},
		objects: models.GcpStorageObjectListPage{
			Entries: []models.GcpStorageObject{{Key: "docs/readme.txt"}},
		},
	}
	service := gcpStorageTestService(t, inv)
	lockGcpWorkspace(t, service)

	if _, err := service.Handle(context.Background(), "gcp.storage.selectBucket", []byte(`{"bucketName":"alpha"}`), nil); err != nil {
		t.Fatalf("selectBucket: %v", err)
	}
	result, err := service.Handle(context.Background(), "gcp.storage.setPrefixFilter", []byte(`{"prefix":"docs/"}`), nil)
	if err != nil {
		t.Fatalf("setPrefixFilter: %v", err)
	}
	workspace, ok := result.(models.WorkspaceSnapshot)
	if !ok {
		t.Fatalf("result type %T", result)
	}
	if workspace.GcpStoragePrefixFilter != "docs/" {
		t.Fatalf("workspace prefix = %q", workspace.GcpStoragePrefixFilter)
	}
	if inv.lastPrefix != "docs/" {
		t.Fatalf("list prefix = %q", inv.lastPrefix)
	}

	loaded, ok, err := service.store.LoadSession(context.Background())
	if err != nil || !ok {
		t.Fatalf("LoadSession ok=%v err=%v", ok, err)
	}
	if loaded.GcpStoragePrefixFilter != "docs/" {
		t.Fatalf("session prefix = %q", loaded.GcpStoragePrefixFilter)
	}
}

func TestHandleGcpStorageSelectBucketRejectsUnlocked(t *testing.T) {
	service := gcpStorageTestService(t, &stubGcpStorageInventory{})
	_, err := service.Handle(context.Background(), "gcp.storage.selectBucket", json.RawMessage(`{"bucketName":"alpha"}`), nil)
	if err == nil {
		t.Fatal("expected error for unlocked workspace")
	}
	if !strings.Contains(err.Error(), "GCP workspace") {
		t.Fatalf("error = %v", err)
	}
}

func TestHandleGcpStorageSignURLDoesNotRequireWriteMode(t *testing.T) {
	inv := &stubGcpStorageInventory{
		buckets: []models.GcpStorageBucket{{Name: "alpha"}},
	}
	service := gcpStorageTestService(t, inv)
	lockGcpWorkspace(t, service)
	if _, err := service.Handle(context.Background(), "gcp.storage.selectBucket", []byte(`{"bucketName":"alpha"}`), nil); err != nil {
		t.Fatalf("selectBucket: %v", err)
	}
	// Write mode remains off; sign-url must still succeed.
	result, err := service.Handle(context.Background(), "gcp.storage.signUrl", []byte(`{"objectKey":"docs/readme.txt","durationSeconds":3600}`), nil)
	if err != nil {
		t.Fatalf("signUrl: %v", err)
	}
	if inv.signCalls != 1 {
		t.Fatalf("signCalls = %d", inv.signCalls)
	}
	if inv.lastSignKey != "docs/readme.txt" || inv.lastBucket != "alpha" {
		t.Fatalf("sign args bucket=%q key=%q", inv.lastBucket, inv.lastSignKey)
	}
	payload, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("result type %T", result)
	}
	signed, ok := payload["result"].(models.GcpStorageSignURLResult)
	if !ok {
		t.Fatalf("result payload type %T", payload["result"])
	}
	if !strings.Contains(signed.URL, "X-Goog-Signature=mock") {
		t.Fatalf("url = %q", signed.URL)
	}
}

func TestHandleGcpStorageSignURLRejectsFolderPrefix(t *testing.T) {
	inv := &stubGcpStorageInventory{
		buckets: []models.GcpStorageBucket{{Name: "alpha"}},
	}
	service := gcpStorageTestService(t, inv)
	lockGcpWorkspace(t, service)
	if _, err := service.Handle(context.Background(), "gcp.storage.selectBucket", []byte(`{"bucketName":"alpha"}`), nil); err != nil {
		t.Fatalf("selectBucket: %v", err)
	}
	_, err := service.Handle(context.Background(), "gcp.storage.signUrl", []byte(`{"objectKey":"docs/"}`), nil)
	if err == nil {
		t.Fatal("expected folder prefix rejection")
	}
	if !strings.Contains(err.Error(), "folder") {
		t.Fatalf("error = %v", err)
	}
}
