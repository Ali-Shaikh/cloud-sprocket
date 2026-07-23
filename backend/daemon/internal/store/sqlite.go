// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"

	"cloudsprocket/backend/daemon/internal/models"
)

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}

	// The store is a single embedded SQLite file written from concurrent job
	// goroutines (deployment status, activity log). Serialise access to one
	// connection and wait on locks so a write is never silently dropped with
	// SQLITE_BUSY, which previously stranded deployments at "planning" under load.
	db.SetMaxOpenConns(1)
	if _, err := db.ExecContext(context.Background(), "PRAGMA busy_timeout=5000"); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("configure sqlite busy_timeout: %w", err)
	}

	store := &Store{db: db}
	if err := store.migrate(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}

	return store, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) SaveSession(ctx context.Context, session models.SessionSnapshot) error {
	payload, err := json.Marshal(session)
	if err != nil {
		return err
	}

	_, err = s.db.ExecContext(
		ctx,
		`INSERT INTO session_state (id, payload_json, updated_at)
		 VALUES (1, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(id) DO UPDATE SET
		   payload_json = excluded.payload_json,
		   updated_at = excluded.updated_at`,
		string(payload),
	)
	return err
}

func (s *Store) LoadSession(ctx context.Context) (models.SessionSnapshot, bool, error) {
	row := s.db.QueryRowContext(ctx, `SELECT payload_json FROM session_state WHERE id = 1`)

	var payload string
	if err := row.Scan(&payload); err != nil {
		if err == sql.ErrNoRows {
			return models.SessionSnapshot{}, false, nil
		}
		return models.SessionSnapshot{}, false, err
	}

	var session models.SessionSnapshot
	if err := json.Unmarshal([]byte(payload), &session); err != nil {
		return models.SessionSnapshot{}, false, err
	}

	return session, true, nil
}

func (s *Store) SaveAppSetting(ctx context.Context, key string, value any) error {
	payload, err := json.Marshal(value)
	if err != nil {
		return err
	}

	_, err = s.db.ExecContext(
		ctx,
		`INSERT INTO app_settings (setting_key, value_json, updated_at)
		 VALUES (?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(setting_key) DO UPDATE SET
		   value_json = excluded.value_json,
		   updated_at = excluded.updated_at`,
		key,
		string(payload),
	)
	return err
}

func (s *Store) LoadAppSetting(ctx context.Context, key string, target any) (bool, error) {
	row := s.db.QueryRowContext(ctx, `SELECT value_json FROM app_settings WHERE setting_key = ?`, key)

	var payload string
	if err := row.Scan(&payload); err != nil {
		if err == sql.ErrNoRows {
			return false, nil
		}
		return false, err
	}

	if err := json.Unmarshal([]byte(payload), target); err != nil {
		return false, err
	}
	return true, nil
}

func (s *Store) AppendLog(
	ctx context.Context,
	level string,
	message string,
	details string,
	timestamp string,
) (models.ActivityLogEntry, error) {
	result, err := s.db.ExecContext(
		ctx,
		`INSERT INTO activity_log (level, message, details, timestamp)
		 VALUES (?, ?, ?, ?)`,
		level,
		message,
		details,
		timestamp,
	)
	if err != nil {
		return models.ActivityLogEntry{}, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return models.ActivityLogEntry{}, err
	}

	return models.ActivityLogEntry{
		ID:        id,
		Level:     level,
		Message:   message,
		Timestamp: timestamp,
		Details:   details,
	}, nil
}

func (s *Store) SaveResourceCache(
	ctx context.Context,
	scope string,
	queryHash string,
	value any,
	fetchedAt string,
) error {
	payload, err := json.Marshal(value)
	if err != nil {
		return err
	}

	_, err = s.db.ExecContext(
		ctx,
		`INSERT INTO resource_cache (scope, query_hash, payload_json, fetched_at)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT(scope, query_hash) DO UPDATE SET
		   payload_json = excluded.payload_json,
		   fetched_at = excluded.fetched_at`,
		scope,
		queryHash,
		string(payload),
		fetchedAt,
	)
	return err
}

func (s *Store) LoadResourceCache(
	ctx context.Context,
	scope string,
	queryHash string,
	target any,
) (string, bool, error) {
	row := s.db.QueryRowContext(
		ctx,
		`SELECT payload_json, fetched_at
		 FROM resource_cache
		 WHERE scope = ? AND query_hash = ?`,
		scope,
		queryHash,
	)

	var payload string
	var fetchedAt string
	if err := row.Scan(&payload, &fetchedAt); err != nil {
		if err == sql.ErrNoRows {
			return "", false, nil
		}
		return "", false, err
	}

	if err := json.Unmarshal([]byte(payload), target); err != nil {
		return "", false, err
	}
	return fetchedAt, true, nil
}

func (s *Store) InvalidateResourceCache(ctx context.Context, scope string, queryHash string) error {
	_, err := s.db.ExecContext(
		ctx,
		`DELETE FROM resource_cache WHERE scope = ? AND query_hash = ?`,
		scope,
		queryHash,
	)
	return err
}

func (s *Store) InvalidateResourceCacheScope(ctx context.Context, scope string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM resource_cache WHERE scope = ?`, scope)
	return err
}

func (s *Store) InvalidateResourceCacheLike(ctx context.Context, pattern string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM resource_cache WHERE scope LIKE ?`, pattern)
	return err
}

// SaveDeployment upserts a deployment record stored as a JSON payload keyed by
// id. createdAt is preserved on update; updatedAt always advances.
func (s *Store) SaveDeployment(ctx context.Context, id string, value any, timestamp string) error {
	payload, err := json.Marshal(value)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(
		ctx,
		`INSERT INTO deployments (id, payload_json, created_at, updated_at)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
		   payload_json = excluded.payload_json,
		   updated_at = excluded.updated_at`,
		id,
		string(payload),
		timestamp,
		timestamp,
	)
	return err
}

// SaveDeploymentWithLog atomically persists a deployment and its related
// activity entry. Neither write is visible unless both succeed.
func (s *Store) SaveDeploymentWithLog(
	ctx context.Context,
	id string,
	value any,
	deploymentTimestamp string,
	level string,
	message string,
	details string,
	logTimestamp string,
) (models.ActivityLogEntry, error) {
	payload, err := json.Marshal(value)
	if err != nil {
		return models.ActivityLogEntry{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return models.ActivityLogEntry{}, err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO deployments (id, payload_json, created_at, updated_at)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
		   payload_json = excluded.payload_json,
		   updated_at = excluded.updated_at`,
		id,
		string(payload),
		deploymentTimestamp,
		deploymentTimestamp,
	); err != nil {
		return models.ActivityLogEntry{}, err
	}
	result, err := tx.ExecContext(
		ctx,
		`INSERT INTO activity_log (level, message, details, timestamp)
		 VALUES (?, ?, ?, ?)`,
		level,
		message,
		details,
		logTimestamp,
	)
	if err != nil {
		return models.ActivityLogEntry{}, err
	}
	logID, err := result.LastInsertId()
	if err != nil {
		return models.ActivityLogEntry{}, err
	}
	if err := tx.Commit(); err != nil {
		return models.ActivityLogEntry{}, err
	}
	return models.ActivityLogEntry{
		ID:        logID,
		Level:     level,
		Message:   message,
		Details:   details,
		Timestamp: logTimestamp,
	}, nil
}

// LoadDeployment unmarshals a single deployment into target.
func (s *Store) LoadDeployment(ctx context.Context, id string, target any) (bool, error) {
	row := s.db.QueryRowContext(ctx, `SELECT payload_json FROM deployments WHERE id = ?`, id)
	var payload string
	if err := row.Scan(&payload); err != nil {
		if err == sql.ErrNoRows {
			return false, nil
		}
		return false, err
	}
	if err := json.Unmarshal([]byte(payload), target); err != nil {
		return false, err
	}
	return true, nil
}

// ListDeploymentsJSON returns every deployment payload, newest first.
func (s *Store) ListDeploymentsJSON(ctx context.Context) ([]json.RawMessage, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT payload_json FROM deployments ORDER BY created_at DESC, id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	payloads := []json.RawMessage{}
	for rows.Next() {
		var payload string
		if err := rows.Scan(&payload); err != nil {
			return nil, err
		}
		payloads = append(payloads, json.RawMessage(payload))
	}
	return payloads, rows.Err()
}

// DeleteDeployment removes a deployment record.
func (s *Store) DeleteDeployment(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM deployments WHERE id = ?`, id)
	return err
}

func (s *Store) ResetAppData(ctx context.Context) error {
	statements := []string{
		`DELETE FROM session_state`,
		`DELETE FROM app_settings`,
		`DELETE FROM resource_cache`,
		`DELETE FROM activity_log`,
		`DELETE FROM deployments`,
		`DELETE FROM sqlite_sequence WHERE name = 'activity_log'`,
	}

	for _, statement := range statements {
		if _, err := s.db.ExecContext(ctx, statement); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) ListLogs(ctx context.Context, limit int) ([]models.ActivityLogEntry, error) {
	if limit <= 0 {
		limit = 50
	}

	rows, err := s.db.QueryContext(
		ctx,
		`SELECT id, level, message, timestamp, details
		 FROM activity_log
		 ORDER BY id DESC
		 LIMIT ?`,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	logs := []models.ActivityLogEntry{}
	for rows.Next() {
		var entry models.ActivityLogEntry
		if err := rows.Scan(&entry.ID, &entry.Level, &entry.Message, &entry.Timestamp, &entry.Details); err != nil {
			return nil, err
		}
		logs = append(logs, entry)
	}
	return logs, rows.Err()
}

// execContext is the subset of *sql.Tx / *sql.Conn used by migrations.
type execContext interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

// migration is a numbered schema step applied once and recorded in
// schema_migrations. Add new steps at the end of schemaMigrations only.
type migration struct {
	version int
	apply   func(ctx context.Context, exec execContext) error
}

// schemaMigrations is the ordered list of schema steps. Version 1 is the
// baseline that matches stores created before versioned migrations existed.
var schemaMigrations = []migration{
	{version: 1, apply: migrateV1},
}

func (s *Store) migrate(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			applied_at TEXT NOT NULL
		)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	if err := validateMigrationSequence(schemaMigrations); err != nil {
		return err
	}

	// Reject gapped history before applying any pending step so a newer
	// migration cannot commit on top of a broken ledger.
	if err := s.validateRecordedMigrationHistory(ctx, true); err != nil {
		return err
	}

	for _, step := range schemaMigrations {
		if err := s.applyMigration(ctx, step); err != nil {
			return fmt.Errorf("apply migration %d: %w", step.version, err)
		}
	}
	if err := s.validateRecordedMigrationHistory(ctx, false); err != nil {
		return err
	}
	return nil
}

// validateRecordedMigrationHistory ensures schema_migrations is contiguous
// from version 1 (detects gaps or partial history from older tools). When
// allowEmpty is true, an empty table is accepted (fresh database).
func (s *Store) validateRecordedMigrationHistory(ctx context.Context, allowEmpty bool) error {
	rows, err := s.db.QueryContext(ctx, `SELECT version FROM schema_migrations ORDER BY version ASC`)
	if err != nil {
		return fmt.Errorf("list schema migrations: %w", err)
	}
	defer rows.Close()

	expected := 1
	count := 0
	for rows.Next() {
		var version int
		if err := rows.Scan(&version); err != nil {
			return err
		}
		if version != expected {
			return fmt.Errorf("schema_migrations has a gap or out-of-order entry: expected %d, found %d", expected, version)
		}
		expected++
		count++
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if count == 0 && !allowEmpty {
		return fmt.Errorf("schema_migrations is empty after migrate")
	}
	return nil
}

func validateMigrationSequence(steps []migration) error {
	expected := 1
	for _, step := range steps {
		if step.version != expected {
			return fmt.Errorf("schema migrations must be contiguous from 1: expected version %d, got %d", expected, step.version)
		}
		if step.apply == nil {
			return fmt.Errorf("schema migration %d has a nil apply function", step.version)
		}
		expected++
	}
	return nil
}

func (s *Store) schemaVersion(ctx context.Context) (int, error) {
	var version int
	err := s.db.QueryRowContext(ctx, `SELECT COALESCE(MAX(version), 0) FROM schema_migrations`).Scan(&version)
	if err != nil {
		return 0, fmt.Errorf("read schema version: %w", err)
	}
	return version, nil
}

// applyMigration applies one step under BEGIN IMMEDIATE so concurrent Open
// calls on the same database cannot both select and insert the same version.
func (s *Store) applyMigration(ctx context.Context, step migration) error {
	conn, err := s.db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()

	if _, err := conn.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return err
	}
	committed := false
	defer func() {
		if !committed {
			_, _ = conn.ExecContext(ctx, "ROLLBACK")
		}
	}()

	var alreadyApplied int
	if err := conn.QueryRowContext(
		ctx,
		`SELECT COUNT(*) FROM schema_migrations WHERE version = ?`,
		step.version,
	).Scan(&alreadyApplied); err != nil {
		return fmt.Errorf("read schema version %d: %w", step.version, err)
	}
	if alreadyApplied > 0 {
		if _, err := conn.ExecContext(ctx, "COMMIT"); err != nil {
			return err
		}
		committed = true
		return nil
	}

	// Under the exclusive lock, history must still be contiguous and the next
	// version must be exactly current+1 (or 1 when the ledger is empty).
	var current int
	if err := conn.QueryRowContext(ctx, `SELECT COALESCE(MAX(version), 0) FROM schema_migrations`).Scan(&current); err != nil {
		return fmt.Errorf("read schema version: %w", err)
	}
	if step.version != current+1 {
		return fmt.Errorf("cannot apply migration %d: next expected version is %d", step.version, current+1)
	}
	if err := validateRecordedVersionsOnConn(ctx, conn); err != nil {
		return err
	}

	if err := step.apply(ctx, conn); err != nil {
		return err
	}
	if _, err := conn.ExecContext(
		ctx,
		`INSERT INTO schema_migrations (version, applied_at) VALUES (?, CURRENT_TIMESTAMP)`,
		step.version,
	); err != nil {
		return err
	}
	if _, err := conn.ExecContext(ctx, "COMMIT"); err != nil {
		return err
	}
	committed = true
	return nil
}

// validateRecordedVersionsOnConn checks contiguous 1..N history on an open
// connection (used inside BEGIN IMMEDIATE). Empty history is allowed.
func validateRecordedVersionsOnConn(ctx context.Context, conn *sql.Conn) error {
	rows, err := conn.QueryContext(ctx, `SELECT version FROM schema_migrations ORDER BY version ASC`)
	if err != nil {
		return fmt.Errorf("list schema migrations: %w", err)
	}
	defer rows.Close()

	expected := 1
	for rows.Next() {
		var version int
		if err := rows.Scan(&version); err != nil {
			return err
		}
		if version != expected {
			return fmt.Errorf("schema_migrations has a gap or out-of-order entry: expected %d, found %d", expected, version)
		}
		expected++
	}
	return rows.Err()
}

// migrateV1 creates the baseline application tables. Statements use
// IF NOT EXISTS so existing installs without schema_migrations upgrade
// safely and record version 1 without data loss.
func migrateV1(ctx context.Context, exec execContext) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS app_settings (
			setting_key TEXT PRIMARY KEY,
			value_json TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS session_state (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			payload_json TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS resource_cache (
			scope TEXT NOT NULL,
			query_hash TEXT NOT NULL,
			payload_json TEXT NOT NULL,
			fetched_at TEXT NOT NULL,
			PRIMARY KEY(scope, query_hash)
		)`,
		`CREATE TABLE IF NOT EXISTS activity_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			level TEXT NOT NULL,
			message TEXT NOT NULL,
			details TEXT NOT NULL DEFAULT '',
			timestamp TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS deployments (
			id TEXT PRIMARY KEY,
			payload_json TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
	}

	for _, statement := range statements {
		if _, err := exec.ExecContext(ctx, statement); err != nil {
			return err
		}
	}
	return nil
}
