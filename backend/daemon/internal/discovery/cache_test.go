// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package discovery

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
)

func TestDiscoverUsesTTLCacheUntilInvalidate(t *testing.T) {
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")
	mustWriteFile(t, filepath.Join(home, ".aws", "config"), "[profile sandbox]\nregion = us-east-1\n")

	settings := config.FromEnv(map[string]string{}, "linux", home)
	lookups := 0
	service := New(settings, func(command string) (string, error) {
		lookups++
		return "/usr/bin/" + command, nil
	})
	fixed := time.Date(2026, 6, 22, 12, 0, 0, 0, time.UTC)
	service.now = func() time.Time { return fixed }
	service.cacheTTL = 3 * time.Second

	if _, err := service.Discover(); err != nil {
		t.Fatalf("first Discover: %v", err)
	}
	firstLookups := lookups
	if _, err := service.Discover(); err != nil {
		t.Fatalf("second Discover: %v", err)
	}
	if lookups != firstLookups {
		t.Fatalf("expected cached Discover to skip CLI probes, lookups=%d first=%d", lookups, firstLookups)
	}

	service.Invalidate()
	if _, err := service.Discover(); err != nil {
		t.Fatalf("Discover after invalidate: %v", err)
	}
	if lookups <= firstLookups {
		t.Fatalf("expected invalidate to force rediscovery, lookups=%d first=%d", lookups, firstLookups)
	}
}

func TestDiscoverCacheKeyChangesWhenConfigMtimeChanges(t *testing.T) {
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")
	awsConfig := filepath.Join(home, ".aws", "config")
	mustWriteFile(t, awsConfig, "[profile sandbox]\nregion = us-east-1\n")

	settings := config.FromEnv(map[string]string{}, "linux", home)
	service := New(settings, func(string) (string, error) { return "", nil })
	fixed := time.Date(2026, 6, 22, 12, 0, 0, 0, time.UTC)
	service.now = func() time.Time { return fixed }

	firstKey := service.configCacheKey()
	if err := os.Chtimes(awsConfig, fixed.Add(time.Second), fixed.Add(time.Second)); err != nil {
		t.Fatalf("Chtimes: %v", err)
	}
	secondKey := service.configCacheKey()
	if firstKey == secondKey {
		t.Fatalf("expected cache key to change when config mtime changes")
	}
}