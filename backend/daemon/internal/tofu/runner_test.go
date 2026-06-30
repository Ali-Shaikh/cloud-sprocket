// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package tofu

import (
	"strings"
	"testing"
)

func TestMergeEnvOverlayWins(t *testing.T) {
	got := mergeEnv(
		[]string{"ARM_CLIENT_ID=from-shell", "PATH=/bin"},
		[]string{"ARM_CLIENT_ID=from-deploy", "ARM_USE_CLI=false"},
	)
	values := map[string]string{}
	for _, entry := range got {
		key, value, ok := strings.Cut(entry, "=")
		if !ok {
			t.Fatalf("invalid env entry %q", entry)
		}
		values[key] = value
	}
	if values["ARM_CLIENT_ID"] != "from-deploy" {
		t.Fatalf("expected deployment ARM_CLIENT_ID to win, got %q", values["ARM_CLIENT_ID"])
	}
	if values["PATH"] != "/bin" {
		t.Fatalf("expected PATH to be preserved, got %q", values["PATH"])
	}
}