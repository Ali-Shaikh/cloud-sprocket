// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package store

import (
	"context"
	"path/filepath"
	"testing"

	"cloudsprocket/backend/daemon/internal/models"
)

func TestStorePersistsSessionLogsAndSettings(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "cloudsprocket.db"))
	if err != nil {
		t.Fatalf("expected sqlite store to open, got %v", err)
	}
	defer store.Close()

	ctx := context.Background()
	session := models.SessionSnapshot{
		CurrentProviderID:    "aws",
		SelectedProfileID:    "sandbox",
		SelectedAuthMethod:   models.AuthMethodCLI,
		IsLocked:             true,
		LockedProviderID:     "aws",
		LockedProfileID:      "sandbox",
		LockedAuthMethod:     models.AuthMethodCLI,
		AvailableAuthMethods: []models.AuthMethodStatus{{Method: models.AuthMethodCLI, Label: "CLI", Summary: "AWS CLI detected.", Available: true}},
	}

	if err := store.SaveSession(ctx, session); err != nil {
		t.Fatalf("expected session save to succeed, got %v", err)
	}
	loaded, ok, err := store.LoadSession(ctx)
	if err != nil {
		t.Fatalf("expected session load to succeed, got %v", err)
	}
	if !ok || loaded.SelectedProfileID != "sandbox" {
		t.Fatalf("expected stored session to round-trip, got %+v", loaded)
	}

	if err := store.SaveAppSetting(ctx, "theme", map[string]string{"mode": "light"}); err != nil {
		t.Fatalf("expected app setting save to succeed, got %v", err)
	}
	var theme map[string]string
	if ok, err := store.LoadAppSetting(ctx, "theme", &theme); err != nil || !ok {
		t.Fatalf("expected app setting load to succeed, got ok=%v err=%v", ok, err)
	}
	if theme["mode"] != "light" {
		t.Fatalf("expected theme mode to round-trip, got %+v", theme)
	}

	entry, err := store.AppendLog(ctx, "info", "Session locked.", "", "2026-04-14T09:00:00Z")
	if err != nil {
		t.Fatalf("expected log append to succeed, got %v", err)
	}
	logs, err := store.ListLogs(ctx, 10)
	if err != nil {
		t.Fatalf("expected log list to succeed, got %v", err)
	}
	if len(logs) != 1 || logs[0].ID != entry.ID {
		t.Fatalf("expected one stored log entry, got %+v", logs)
	}

	if err := store.SaveResourceCache(ctx, "aws:s3", "query", map[string]string{"bucket": "demo"}, "2026-04-14T09:00:00Z"); err != nil {
		t.Fatalf("expected resource cache save to succeed, got %v", err)
	}

	if err := store.ResetAppData(ctx); err != nil {
		t.Fatalf("expected reset to succeed, got %v", err)
	}
	if _, ok, err := store.LoadSession(ctx); err != nil || ok {
		t.Fatalf("expected session to be cleared, ok=%v err=%v", ok, err)
	}
	if ok, err := store.LoadAppSetting(ctx, "theme", &theme); err != nil || ok {
		t.Fatalf("expected app setting to be cleared, ok=%v err=%v", ok, err)
	}
	var cached map[string]string
	if _, ok, err := store.LoadResourceCache(ctx, "aws:s3", "query", &cached); err != nil || ok {
		t.Fatalf("expected resource cache to be cleared, ok=%v err=%v", ok, err)
	}
	if logs, err := store.ListLogs(ctx, 10); err != nil || len(logs) != 0 {
		t.Fatalf("expected logs to be cleared, logs=%+v err=%v", logs, err)
	}
}

func TestSaveDeploymentWithLogRollsBackBothWrites(t *testing.T) {
	dataStore, err := Open(filepath.Join(t.TempDir(), "cloudsprocket.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer dataStore.Close()

	ctx := context.Background()
	if err := dataStore.SaveDeployment(ctx, "dep-1", map[string]string{"status": "planned"}, "2026-07-16T10:00:00Z"); err != nil {
		t.Fatalf("save initial deployment: %v", err)
	}
	if _, err := dataStore.db.ExecContext(ctx, `CREATE TRIGGER fail_activity_insert
		BEFORE INSERT ON activity_log BEGIN
			SELECT RAISE(ABORT, 'forced activity failure');
		END`); err != nil {
		t.Fatalf("create failure trigger: %v", err)
	}

	if _, err := dataStore.SaveDeploymentWithLog(
		ctx,
		"dep-1",
		map[string]string{"status": "override-accepted"},
		"2026-07-16T10:01:00Z",
		"warning",
		"Policy override accepted.",
		"",
		"2026-07-16T10:01:00Z",
	); err == nil {
		t.Fatal("expected the activity insert to fail")
	}

	var deployment map[string]string
	if ok, err := dataStore.LoadDeployment(ctx, "dep-1", &deployment); err != nil || !ok {
		t.Fatalf("load deployment: ok=%v err=%v", ok, err)
	}
	if deployment["status"] != "planned" {
		t.Fatalf("deployment write was not rolled back: %+v", deployment)
	}
	if logs, err := dataStore.ListLogs(ctx, 10); err != nil || len(logs) != 0 {
		t.Fatalf("activity write was not rolled back: logs=%+v err=%v", logs, err)
	}
}
