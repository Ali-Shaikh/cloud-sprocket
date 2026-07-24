// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
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

func TestBuildDockerRuntimeSnapshotFallsBackToResolveDockerHostOnWindows(t *testing.T) {
	t.Setenv("DOCKER_HOST", "")
	t.Setenv("DOCKER_CONTEXT", "")
	settings := config.FromEnv(map[string]string{}, "windows", filepath.Join(t.TempDir(), "home"))
	if settings.PlatformName != "windows" {
		t.Fatalf("expected PlatformName windows, got %q", settings.PlatformName)
	}
	s := &Service{settings: settings, docker: nil}

	snapshot := s.buildDockerRuntimeSnapshot()
	if snapshot.Reachable {
		t.Fatalf("expected unreachable snapshot when docker client is nil, got %+v", snapshot)
	}
	if snapshot.Host != "npipe:////./pipe/docker_engine" {
		t.Fatalf("expected Windows named-pipe host from dockerruntime resolver, got %q (source=%q)", snapshot.Host, snapshot.HostSource)
	}
	if snapshot.HostSource != "Default Windows named pipe" {
		t.Fatalf("expected Windows named-pipe host source, got %q", snapshot.HostSource)
	}
	if snapshot.Summary != "Docker engine endpoint was detected, but live runtime probing is unavailable." {
		t.Fatalf("expected host-detected fallback summary, got %q", snapshot.Summary)
	}

	diagnostics := s.dockerDiagnosticsFromSnapshot(snapshot)
	if diagnostics.EngineState != models.DockerEngineStateUnavailable {
		t.Fatalf("expected unavailable engine state when host is known, got %s", diagnostics.EngineState)
	}
	if diagnostics.Host != snapshot.Host {
		t.Fatalf("expected diagnostics host to match snapshot, got %q", diagnostics.Host)
	}
	for _, detail := range diagnostics.Details {
		if detail.Label == "Note" && detail.Value == "Windows named-pipe verification is deferred until the Docker runtime slice." {
			t.Fatal("foundation-era deferred named-pipe note must not appear after F-016")
		}
	}
}

func TestBuildDockerRuntimeSnapshotFallsBackWhenSnapshotErrors(t *testing.T) {
	t.Setenv("DOCKER_HOST", "unix:///tmp/cloudsprocket-f016-docker.sock")
	t.Setenv("DOCKER_CONTEXT", "desktop-linux")
	settings := config.FromEnv(map[string]string{}, "linux", filepath.Join(t.TempDir(), "home"))
	s := &Service{
		settings: settings,
		docker:   &countingDockerRuntime{},
	}

	snapshot := s.buildDockerRuntimeSnapshot()
	if snapshot.Reachable {
		t.Fatalf("expected unreachable snapshot after probe error, got %+v", snapshot)
	}
	if snapshot.Host != "unix:///tmp/cloudsprocket-f016-docker.sock" {
		t.Fatalf("expected DOCKER_HOST fallback via ResolveDockerHost, got %q", snapshot.Host)
	}
	if snapshot.HostSource != "DOCKER_HOST" {
		t.Fatalf("expected DOCKER_HOST host source, got %q", snapshot.HostSource)
	}
	if snapshot.ContextName != "desktop-linux" {
		t.Fatalf("expected DOCKER_CONTEXT on fallback snapshot, got %q", snapshot.ContextName)
	}
}
