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
		if strings.Contains(line, "Still working") && strings.Contains(line, "azurerm") {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected still-working line with last progress, got %v", lines)
	}
}
