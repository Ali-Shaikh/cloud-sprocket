// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package sysenv

import (
	"os"
	"runtime"
	"strings"
	"testing"
)

func TestMergePathEntriesDedupesAndPreservesOrder(t *testing.T) {
	merged := mergePathEntries("/opt/homebrew/bin", "/usr/bin", "/opt/homebrew/bin", "/usr/local/bin")
	separator := string(os.PathListSeparator)
	expected := strings.Join([]string{"/opt/homebrew/bin", "/usr/bin", "/usr/local/bin"}, separator)
	if merged != expected {
		t.Fatalf("unexpected merged path: %q", merged)
	}
}

func TestEnsureDeveloperPathPrependsHomebrewOnDarwin(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("darwin-only")
	}
	t.Setenv("PATH", "/usr/bin:/bin")
	EnsureDeveloperPath()
	got := splitPath(os.Getenv("PATH"))
	if len(got) < 2 || got[0] != "/opt/homebrew/bin" {
		t.Fatalf("expected homebrew first, got %v", got)
	}
}