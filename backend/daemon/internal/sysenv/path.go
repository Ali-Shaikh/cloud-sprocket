// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package sysenv

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// EnsureDeveloperPath prepends common developer tool locations to PATH when the
// desktop sidecar inherits a minimal GUI environment (notably on macOS, where
// Homebrew paths are often missing). Idempotent: already-present entries are
// not duplicated.
func EnsureDeveloperPath() {
	current := os.Getenv("PATH")
	merged := mergePathEntries(append(developerPathCandidates(), splitPath(current)...)...)
	if merged == current {
		return
	}
	_ = os.Setenv("PATH", merged)
}

func developerPathCandidates() []string {
	switch runtime.GOOS {
	case "darwin":
		candidates := []string{
			"/opt/homebrew/bin",
			"/opt/homebrew/sbin",
			"/usr/local/bin",
			"/usr/local/sbin",
		}
		candidates = append(candidates, pathsFromEtcPaths()...)
		if home, err := os.UserHomeDir(); err == nil && home != "" {
			candidates = append(candidates,
				filepath.Join(home, ".local", "bin"),
				filepath.Join(home, "bin"),
			)
		}
		return candidates
	case "linux":
		candidates := []string{"/usr/local/bin", "/usr/local/sbin"}
		if home, err := os.UserHomeDir(); err == nil && home != "" {
			candidates = append(candidates,
				filepath.Join(home, ".local", "bin"),
				filepath.Join(home, "bin"),
			)
		}
		return candidates
	default:
		return nil
	}
}

func pathsFromEtcPaths() []string {
	entries := readPathFile("/etc/paths")
	matches, err := filepath.Glob("/etc/paths.d/*")
	if err != nil {
		return entries
	}
	for _, match := range matches {
		entries = append(entries, readPathFile(match)...)
	}
	return entries
}

func readPathFile(path string) []string {
	payload, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	lines := strings.Split(string(payload), "\n")
	entries := make([]string, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		entries = append(entries, trimmed)
	}
	return entries
}

func splitPath(value string) []string {
	if value == "" {
		return nil
	}
	separator := string(os.PathListSeparator)
	parts := strings.Split(value, separator)
	entries := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			entries = append(entries, trimmed)
		}
	}
	return entries
}

func mergePathEntries(entries ...string) string {
	seen := map[string]struct{}{}
	ordered := make([]string, 0, len(entries))
	for _, entry := range entries {
		cleaned := strings.TrimSpace(entry)
		if cleaned == "" {
			continue
		}
		key := strings.ToLower(cleaned)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		ordered = append(ordered, cleaned)
	}
	return strings.Join(ordered, string(os.PathListSeparator))
}