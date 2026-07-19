// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"cloudsprocket/backend/daemon/internal/tofu"
)

const (
	// tofuInitTimeout bounds provider downloads and backend init. azurerm alone
	// is roughly a 63 MB zip / 240 MB binary and can take several minutes on a
	// slow link; longer than this is treated as a hard failure with guidance.
	tofuInitTimeout = 10 * time.Minute
)

// deployProgressHeartbeat surfaces silent stalls (tofu only prints when a
// phase changes, so "Installing provider..." can sit for a long time).
// Mutable for tests.
var deployProgressHeartbeat = 45 * time.Second

// WithProgressHeartbeat wraps onLine and emits a reminder when OpenTofu has
// produced no new lines for deployProgressHeartbeat. Stop must be called when
// the operation ends.
func WithProgressHeartbeat(ctx context.Context, onLine tofu.LogFunc) (wrapped tofu.LogFunc, stop func()) {
	if onLine == nil {
		return func(string) {}, func() {}
	}

	var mu sync.Mutex
	lastLine := "Waiting for OpenTofu output."
	lastAt := time.Now()
	done := make(chan struct{})

	wrapped = func(line string) {
		mu.Lock()
		// Ignore our own heartbeats so quiet time reflects real tofu output.
		if !isProgressHeartbeatLine(line) {
			lastLine = line
			lastAt = time.Now()
		}
		mu.Unlock()
		onLine(line)
	}

	go func() {
		ticker := time.NewTicker(deployProgressHeartbeat)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-done:
				return
			case <-ticker.C:
				mu.Lock()
				quiet := time.Since(lastAt)
				line := lastLine
				mu.Unlock()
				if quiet < deployProgressHeartbeat {
					continue
				}
				onLine(quietProgressHint(line, quiet))
			}
		}
	}()

	stop = sync.OnceFunc(func() {
		close(done)
	})
	return wrapped, stop
}

func isProgressHeartbeatLine(line string) bool {
	trimmed := strings.TrimSpace(line)
	// Every quietProgressHint message carries this phrase; OpenTofu's own
	// "Still creating..." resource lines do not, so they keep resetting the
	// quiet timer as real output.
	return strings.HasPrefix(trimmed, "Still ") &&
		strings.Contains(trimmed, "with no new OpenTofu output")
}

// quietProgressHint builds a phase-aware reminder so quieter periods read as
// progress rather than a hung UI.
func quietProgressHint(lastLine string, quiet time.Duration) string {
	quietLabel := quiet.Round(time.Second)
	lower := strings.ToLower(lastLine)
	switch {
	case strings.Contains(lower, "installing ") ||
		(strings.Contains(lower, "finding ") && strings.Contains(lower, "versions matching")) ||
		strings.Contains(lower, "provider plugins") ||
		strings.Contains(lower, "initializing provider"):
		return fmt.Sprintf(
			"Still downloading providers after %s with no new OpenTofu output. Large providers such as azurerm can take several minutes on the first run; later runs reuse the app plugin cache. Last line: %s",
			quietLabel,
			lastLine,
		)
	case strings.Contains(lower, "still creating") ||
		strings.Contains(lower, "creating...") ||
		strings.Contains(lower, "creating "):
		return fmt.Sprintf(
			"Still waiting for resources after %s with no new OpenTofu output. Long creates (for example PostgreSQL Flexible Server) can take 1-2 minutes locally while Docker pulls the image. Last line: %s",
			quietLabel,
			lastLine,
		)
	case strings.Contains(lower, "still destroying") ||
		strings.Contains(lower, "destroying...") ||
		strings.Contains(lower, "destroying "):
		return fmt.Sprintf(
			"Still destroying resources after %s with no new OpenTofu output. Emulator or cloud cleanup can sit quiet between API calls. Last line: %s",
			quietLabel,
			lastLine,
		)
	case strings.Contains(lower, "refreshing state") || strings.Contains(lower, "reading..."):
		return fmt.Sprintf(
			"Still refreshing state after %s with no new OpenTofu output. This is normal when many resources are read. Last line: %s",
			quietLabel,
			lastLine,
		)
	default:
		return fmt.Sprintf(
			"Still working after %s with no new OpenTofu output. Quiet periods are normal during provider installs and long resource operations. Last line: %s",
			quietLabel,
			lastLine,
		)
	}
}
