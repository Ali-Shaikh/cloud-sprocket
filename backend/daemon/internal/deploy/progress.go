// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"context"
	"fmt"
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
		lastLine = line
		lastAt = time.Now()
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
				onLine(fmt.Sprintf(
					"Still working after %s with no new OpenTofu output. Last line: %s",
					quiet.Round(time.Second),
					line,
				))
			}
		}
	}()

	stop = sync.OnceFunc(func() {
		close(done)
	})
	return wrapped, stop
}
