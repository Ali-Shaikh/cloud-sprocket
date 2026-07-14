// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package secrets

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// LoadOrCreateKey returns the 32-byte encryption key at path, creating and
// persisting a new random key (0600) when none exists. Keeping the key in a
// separate, restricted file removes sensitive values from the database itself;
// moving the key into the OS keychain is a planned hardening.
func LoadOrCreateKey(path string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if err == nil {
		return decodeKey(path, data)
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("secrets: read key %s: %w", path, err)
	}

	key := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, fmt.Errorf("secrets: generate key: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("secrets: create key dir: %w", err)
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		if errors.Is(err, os.ErrExist) {
			data, readErr := os.ReadFile(path)
			if readErr != nil {
				return nil, fmt.Errorf("secrets: read concurrently created key %s: %w", path, readErr)
			}
			return decodeKey(path, data)
		}
		return nil, fmt.Errorf("secrets: create key: %w", err)
	}

	encoded := []byte(base64.StdEncoding.EncodeToString(key))
	if _, err := file.Write(encoded); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return nil, fmt.Errorf("secrets: write key: %w", err)
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return nil, fmt.Errorf("secrets: sync key: %w", err)
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(path)
		return nil, fmt.Errorf("secrets: close key: %w", err)
	}
	return key, nil
}

func decodeKey(path string, data []byte) ([]byte, error) {
	key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(data)))
	if err != nil {
		return nil, fmt.Errorf("secrets: decode key %s: %w", path, err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("secrets: key %s has invalid length %d, want 32", path, len(key))
	}
	return key, nil
}
