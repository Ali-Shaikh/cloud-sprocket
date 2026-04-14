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
}
