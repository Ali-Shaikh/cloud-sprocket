// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestWithProgressHeartbeatEmitsWhenQuiet(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var mu sync.Mutex
	var lines []string
	onLine := func(line string) {
		mu.Lock()
		lines = append(lines, line)
		mu.Unlock()
	}

	// Temporarily shrink the heartbeat for a deterministic test.
	original := deployProgressHeartbeat
	deployProgressHeartbeat = 40 * time.Millisecond
	defer func() { deployProgressHeartbeat = original }()

	wrapped, stop := WithProgressHeartbeat(ctx, onLine)
	defer stop()
	wrapped("Installing hashicorp/azurerm v4.81.0...")

	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		mu.Lock()
		count := len(lines)
		mu.Unlock()
		if count >= 2 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(lines) < 2 {
		t.Fatalf("expected heartbeat after quiet period, got %v", lines)
	}
	found := false
	for _, line := range lines {
		if strings.Contains(line, "Still downloading providers") && strings.Contains(line, "azurerm") {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected provider-download heartbeat with last progress, got %v", lines)
	}
}

func TestQuietProgressHintPhases(t *testing.T) {
	cases := []struct {
		last string
		want string
	}{
		{"Installing hashicorp/azurerm v4.81.0...", "Still downloading providers"},
		{"azurerm_postgresql_flexible_server.main: Creating...", "Still waiting for resources"},
		{"azurerm_resource_group.main: Destroying...", "Still destroying resources"},
		{"azurerm_resource_group.main: Refreshing state...", "Still refreshing state"},
		{"OpenTofu is planning", "Still working after"},
	}
	for _, tc := range cases {
		got := quietProgressHint(tc.last, 90*time.Second)
		if !strings.Contains(got, tc.want) {
			t.Fatalf("last %q: expected %q in %q", tc.last, tc.want, got)
		}
		if !strings.Contains(got, tc.last) {
			t.Fatalf("last %q: expected original line in %q", tc.last, got)
		}
	}
}

func TestProgressHeartbeatIgnoresOwnLines(t *testing.T) {
	if !isProgressHeartbeatLine("Still working after 45s with no new OpenTofu output.") {
		t.Fatal("expected heartbeat line detection")
	}
	if isProgressHeartbeatLine("Installing hashicorp/azurerm v4.81.0...") {
		t.Fatal("did not expect install line to count as heartbeat")
	}
	if isProgressHeartbeatLine("Still creating... [1m10s elapsed]") {
		t.Fatal("tofu resource progress must keep resetting the quiet timer")
	}
}
