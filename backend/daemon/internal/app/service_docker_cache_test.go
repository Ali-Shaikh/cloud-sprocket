// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"errors"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/models"
)

// countingDockerRuntime reports the engine as unreachable and counts probes.
type countingDockerRuntime struct {
	snapshots int
}

func (d *countingDockerRuntime) Snapshot(context.Context) (models.DockerRuntimeSnapshot, error) {
	d.snapshots++
	return models.DockerRuntimeSnapshot{}, errors.New("engine down")
}

func (d *countingDockerRuntime) ListOwnedResources(context.Context) ([]models.ManagedDockerResource, error) {
	return nil, nil
}

func TestDockerSnapshotCachesUnreachableVerdict(t *testing.T) {
	dock := &countingDockerRuntime{}
	clock := time.Now()
	s := &Service{docker: dock, now: func() time.Time { return clock }}

	if snapshot := s.dockerRuntimeSnapshot(); snapshot.Reachable {
		t.Fatal("expected the engine to be reported unreachable")
	}
	// A second poll within the TTL must be served from cache (no extra probe).
	_ = s.dockerRuntimeSnapshot()
	if dock.snapshots != 1 {
		t.Fatalf("expected the unreachable verdict to be cached, probes = %d", dock.snapshots)
	}

	// After the TTL elapses, the engine is probed again.
	clock = clock.Add(dockerUnreachableCacheTTL + time.Second)
	_ = s.dockerRuntimeSnapshot()
	if dock.snapshots != 2 {
		t.Fatalf("expected a re-probe after the TTL, probes = %d", dock.snapshots)
	}

	// A manual refresh always probes, bypassing the cache.
	_ = s.probeDockerRuntimeSnapshot()
	if dock.snapshots != 3 {
		t.Fatalf("expected a manual refresh to force a probe, probes = %d", dock.snapshots)
	}
}
