// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
)

type fakeCLIExecutor struct {
	args [][]string
	err  error
}

func (f *fakeCLIExecutor) CommandContext(_ context.Context, name string, args ...string) ([]byte, error) {
	if f.err != nil {
		return nil, f.err
	}
	f.args = append(f.args, append([]string{name}, args...))
	if name != "az" || len(args) < 2 || args[0] != "extension" || args[1] != "list" {
		return nil, context.Canceled
	}
	return []byte(`[
		{"name":"log-analytics","version":"1.0.0b1"},
		{"name":"bastion","version":"1.4.3"}
	]`), nil
}

func TestCheckCLIExtensionsReportsMissingRequirements(t *testing.T) {
	fake := &fakeCLIExecutor{}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	statuses := inv.CheckCLIExtensions(context.Background())
	if len(statuses) != len(requiredCLIExtensions) {
		t.Fatalf("expected %d statuses, got %d", len(requiredCLIExtensions), len(statuses))
	}

	byName := map[string]bool{}
	for _, status := range statuses {
		byName[status.Name] = status.Installed
		if status.InstallCommand == "" {
			t.Fatalf("expected install command for %s", status.Name)
		}
	}
	if !byName["log-analytics"] {
		t.Fatalf("expected log-analytics to be installed")
	}
	if !byName["bastion"] {
		t.Fatalf("expected bastion to be installed")
	}
	if byName["front-door"] {
		t.Fatalf("expected front-door to be missing")
	}
}

func TestCheckCLIExtensionsWhenListFails(t *testing.T) {
	inv := NewInventory(config.Settings{})
	inv.runner = &fakeCLIExecutor{err: context.DeadlineExceeded}

	statuses := inv.CheckCLIExtensions(context.Background())
	for _, status := range statuses {
		if status.Installed {
			t.Fatalf("expected %s to be reported missing when extension list fails", status.Name)
		}
		if !strings.Contains(status.Summary, "could not query installed extensions") {
			t.Fatalf("expected query failure hint for %s, got %q", status.Name, status.Summary)
		}
	}
}