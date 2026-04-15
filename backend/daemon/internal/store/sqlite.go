package store

import (
	"context"
	"database/sql"
	"encoding/json"
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

func (s *Store) migrate(ctx context.Context) error {
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
	}

	for _, statement := range statements {
		if _, err := s.db.ExecContext(ctx, statement); err != nil {
			return err
		}
	}
	return nil
}
