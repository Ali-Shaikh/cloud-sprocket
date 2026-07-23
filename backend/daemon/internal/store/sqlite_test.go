// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package store

import (
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"testing"

	_ "modernc.org/sqlite"

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

func TestFreshDBAppliesMigration1(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cloudsprocket.db")
	store, err := Open(path)
	if err != nil {
		t.Fatalf("open fresh store: %v", err)
	}
	defer store.Close()

	version, appliedAt := mustSchemaMigration(t, store, 1)
	if version != 1 {
		t.Fatalf("expected schema version 1 on fresh DB, got %d", version)
	}
	if appliedAt == "" {
		t.Fatal("expected applied_at to be set for migration 1")
	}

	// Baseline tables must exist and be usable.
	ctx := context.Background()
	if err := store.SaveAppSetting(ctx, "probe", "ok"); err != nil {
		t.Fatalf("app_settings should exist after migration 1: %v", err)
	}
}

func TestReopenDoesNotReapplyMigrations(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cloudsprocket.db")

	first, err := Open(path)
	if err != nil {
		t.Fatalf("open first: %v", err)
	}
	_, firstAppliedAt := mustSchemaMigration(t, first, 1)
	if err := first.Close(); err != nil {
		t.Fatalf("close first: %v", err)
	}

	second, err := Open(path)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	defer second.Close()

	version, secondAppliedAt := mustSchemaMigration(t, second, 1)
	if version != 1 {
		t.Fatalf("expected schema version 1 after reopen, got %d", version)
	}
	if secondAppliedAt != firstAppliedAt {
		t.Fatalf("migration 1 was re-applied: first applied_at=%q second=%q", firstAppliedAt, secondAppliedAt)
	}

	var count int
	if err := second.db.QueryRowContext(context.Background(), `SELECT COUNT(*) FROM schema_migrations`).Scan(&count); err != nil {
		t.Fatalf("count schema_migrations: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected a single migration row after reopen, got %d", count)
	}
}

func TestLegacyDBWithoutSchemaMigrationsRecordsVersion1(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")

	// Simulate a pre-versioned store: baseline tables only, no schema_migrations.
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open raw sqlite: %v", err)
	}
	legacyStatements := []string{
		`CREATE TABLE app_settings (
			setting_key TEXT PRIMARY KEY,
			value_json TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE session_state (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			payload_json TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE resource_cache (
			scope TEXT NOT NULL,
			query_hash TEXT NOT NULL,
			payload_json TEXT NOT NULL,
			fetched_at TEXT NOT NULL,
			PRIMARY KEY(scope, query_hash)
		)`,
		`CREATE TABLE activity_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			level TEXT NOT NULL,
			message TEXT NOT NULL,
			details TEXT NOT NULL DEFAULT '',
			timestamp TEXT NOT NULL
		)`,
		`CREATE TABLE deployments (
			id TEXT PRIMARY KEY,
			payload_json TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`INSERT INTO app_settings (setting_key, value_json, updated_at)
		 VALUES ('theme', '"dark"', '2026-01-01T00:00:00Z')`,
	}
	for _, statement := range legacyStatements {
		if _, err := db.Exec(statement); err != nil {
			_ = db.Close()
			t.Fatalf("seed legacy schema: %v", err)
		}
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close legacy seed: %v", err)
	}

	store, err := Open(path)
	if err != nil {
		t.Fatalf("open legacy store: %v", err)
	}
	defer store.Close()

	version, appliedAt := mustSchemaMigration(t, store, 1)
	if version != 1 {
		t.Fatalf("expected legacy DB to record version 1, got %d", version)
	}
	if appliedAt == "" {
		t.Fatal("expected applied_at when recording version 1 for legacy DB")
	}

	ctx := context.Background()
	var theme string
	ok, err := store.LoadAppSetting(ctx, "theme", &theme)
	if err != nil || !ok {
		t.Fatalf("legacy app setting should survive upgrade: ok=%v err=%v", ok, err)
	}
	if theme != "dark" {
		t.Fatalf("legacy data lost or corrupted: got %q", theme)
	}
}

func TestNewerSchemaVersionThanBinaryFailsOpen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "future.db")

	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open raw sqlite: %v", err)
	}
	// Contiguous ledger that ends beyond this binary (max declared is 1).
	seed := []string{
		`CREATE TABLE schema_migrations (
			version INTEGER PRIMARY KEY,
			applied_at TEXT NOT NULL
		)`,
		`INSERT INTO schema_migrations (version, applied_at) VALUES (1, '2026-01-01T00:00:00Z')`,
		`INSERT INTO schema_migrations (version, applied_at) VALUES (2, '2026-01-02T00:00:00Z')`,
	}
	for _, statement := range seed {
		if _, err := db.Exec(statement); err != nil {
			_ = db.Close()
			t.Fatalf("seed future schema: %v", err)
		}
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close seed: %v", err)
	}

	store, err := Open(path)
	if err == nil {
		_ = store.Close()
		t.Fatal("expected Open to fail when database schema is newer than the binary")
	}
	if !strings.Contains(err.Error(), "newer than this binary supports") {
		t.Fatalf("expected unsupported-schema error, got %v", err)
	}
}

func TestGappedMigrationHistoryFailsBeforeApplying(t *testing.T) {
	path := filepath.Join(t.TempDir(), "gapped.db")

	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open raw sqlite: %v", err)
	}
	seed := []string{
		`CREATE TABLE schema_migrations (
			version INTEGER PRIMARY KEY,
			applied_at TEXT NOT NULL
		)`,
		// Contiguous prefix broken: version 1 missing, version 3 present.
		`INSERT INTO schema_migrations (version, applied_at) VALUES (1, '2026-01-01T00:00:00Z')`,
		`INSERT INTO schema_migrations (version, applied_at) VALUES (3, '2026-01-01T00:00:00Z')`,
	}
	for _, statement := range seed {
		if _, err := db.Exec(statement); err != nil {
			_ = db.Close()
			t.Fatalf("seed gapped history: %v", err)
		}
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close seed: %v", err)
	}

	store, err := Open(path)
	if err == nil {
		_ = store.Close()
		t.Fatal("expected Open to fail on gapped schema_migrations history")
	}
	if !strings.Contains(err.Error(), "gap") {
		t.Fatalf("expected gap error, got %v", err)
	}

	// History must be unchanged: no extra migration rows committed.
	check, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("reopen for check: %v", err)
	}
	defer check.Close()
	var count int
	if err := check.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&count); err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected gapped history left untouched (2 rows), got %d", count)
	}
}

// mustSchemaMigration asserts exactly one schema_migrations row for version and
// returns the recorded version and applied_at timestamp.
func mustSchemaMigration(t *testing.T, store *Store, wantVersion int) (int, string) {
	t.Helper()
	row := store.db.QueryRowContext(
		context.Background(),
		`SELECT version, applied_at FROM schema_migrations WHERE version = ?`,
		wantVersion,
	)
	var version int
	var appliedAt string
	if err := row.Scan(&version, &appliedAt); err != nil {
		t.Fatalf("read schema_migrations version %d: %v", wantVersion, err)
	}
	return version, appliedAt
}
