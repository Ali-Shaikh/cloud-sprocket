// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package runtime

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/dockerruntime"
	"cloudsprocket/backend/daemon/internal/models"
)

type countingDocker struct {
	snapshots int
}

func (d *countingDocker) Snapshot(context.Context) (models.DockerRuntimeSnapshot, error) {
	d.snapshots++
	return models.DockerRuntimeSnapshot{}, errors.New("engine down")
}

func (d *countingDocker) ListOwnedResources(context.Context) ([]models.ManagedDockerResource, error) {
	return nil, nil
}

type countingReachableDocker struct {
	snapshots int
	lists     int
}

func (d *countingReachableDocker) Snapshot(context.Context) (models.DockerRuntimeSnapshot, error) {
	d.snapshots++
	return models.DockerRuntimeSnapshot{
		Reachable:  true,
		Host:       "unix:///var/run/docker.sock",
		EngineName: "docker",
		Summary:    "Docker engine is reachable.",
	}, nil
}

func (d *countingReachableDocker) ListOwnedResources(context.Context) ([]models.ManagedDockerResource, error) {
	d.lists++
	return []models.ManagedDockerResource{
		{ResourceID: "c1", Name: "localstack", Kind: "container", State: "running"},
	}, nil
}

type blockingDocker struct{}

func (blockingDocker) Snapshot(ctx context.Context) (models.DockerRuntimeSnapshot, error) {
	<-ctx.Done()
	return models.DockerRuntimeSnapshot{}, ctx.Err()
}

func (blockingDocker) ListOwnedResources(ctx context.Context) ([]models.ManagedDockerResource, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func testService(docker Docker, now func() time.Time, settings config.Settings) *Service {
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	return New(Deps{
		Settings: settings,
		Docker:   docker,
		ResolveDockerHost: func() (string, string) {
			return dockerruntime.ResolveDockerHost(settings)
		},
		Now: now,
	})
}

func TestDockerSnapshotCachesUnreachableVerdict(t *testing.T) {
	dock := &countingDocker{}
	clock := time.Now()
	s := testService(dock, func() time.Time { return clock }, config.Settings{})

	ctx := context.Background()
	if snapshot := s.dockerRuntimeSnapshot(ctx); snapshot.Reachable {
		t.Fatal("expected the engine to be reported unreachable")
	}
	_ = s.dockerRuntimeSnapshot(ctx)
	if dock.snapshots != 1 {
		t.Fatalf("expected the unreachable verdict to be cached, probes = %d", dock.snapshots)
	}

	clock = clock.Add(DockerUnreachableCacheTTL + time.Second)
	_ = s.dockerRuntimeSnapshot(ctx)
	if dock.snapshots != 2 {
		t.Fatalf("expected a re-probe after the TTL, probes = %d", dock.snapshots)
	}

	_ = s.ProbeDockerRuntimeSnapshot(ctx)
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
	s := testService(nil, nil, settings)

	snapshot := s.buildDockerRuntimeSnapshot(context.Background())
	if snapshot.Reachable {
		t.Fatalf("expected unreachable snapshot when docker client is nil, got %+v", snapshot)
	}
	if snapshot.Host != "npipe:////./pipe/docker_engine" {
		t.Fatalf("expected Windows named-pipe host from resolver, got %q (source=%q)", snapshot.Host, snapshot.HostSource)
	}
	if snapshot.HostSource != "Default Windows named pipe" {
		t.Fatalf("expected Windows named-pipe host source, got %q", snapshot.HostSource)
	}
	if snapshot.Summary != "Docker engine endpoint was detected, but live runtime probing is unavailable." {
		t.Fatalf("expected host-detected fallback summary, got %q", snapshot.Summary)
	}

	diagnostics := DiagnosticsFromSnapshot(snapshot)
	if diagnostics.EngineState != models.DockerEngineStateUnavailable {
		t.Fatalf("expected unavailable engine state when host is known, got %s", diagnostics.EngineState)
	}
}

func TestBuildDockerRuntimeSnapshotFallsBackWhenSnapshotErrors(t *testing.T) {
	t.Setenv("DOCKER_HOST", "unix:///tmp/cloudsprocket-f016-docker.sock")
	t.Setenv("DOCKER_CONTEXT", "desktop-linux")
	settings := config.FromEnv(map[string]string{}, "linux", filepath.Join(t.TempDir(), "home"))
	s := testService(&countingDocker{}, nil, settings)

	snapshot := s.buildDockerRuntimeSnapshot(context.Background())
	if snapshot.Reachable {
		t.Fatalf("expected unreachable snapshot after probe error, got %+v", snapshot)
	}
	if snapshot.Host != "unix:///tmp/cloudsprocket-f016-docker.sock" {
		t.Fatalf("expected DOCKER_HOST fallback, got %q", snapshot.Host)
	}
	if snapshot.HostSource != "DOCKER_HOST" {
		t.Fatalf("expected DOCKER_HOST host source, got %q", snapshot.HostSource)
	}
	if snapshot.ContextName != "desktop-linux" {
		t.Fatalf("expected DOCKER_CONTEXT on fallback snapshot, got %q", snapshot.ContextName)
	}
}

func TestCancelledDockerProbeDoesNotPoisonSharedCaches(t *testing.T) {
	clock := time.Now()
	s := testService(blockingDocker{}, func() time.Time { return clock }, config.Settings{})

	ctx, cancel := context.WithCancel(context.Background())
	dockerDone := make(chan models.DockerRuntimeSnapshot, 1)
	go func() {
		dockerDone <- s.probeDockerRuntimeSnapshot(ctx)
	}()
	time.Sleep(40 * time.Millisecond)
	cancel()
	select {
	case snap := <-dockerDone:
		if snap.Reachable {
			t.Fatal("expected soft unreachable snapshot after cancel")
		}
	case <-time.After(DockerProbeTimeout + time.Second):
		t.Fatal("probeDockerRuntimeSnapshot ignored parent cancel")
	}

	dock := &countingReachableDocker{}
	s.docker = dock
	live := s.dockerRuntimeSnapshot(context.Background())
	if !live.Reachable {
		t.Fatalf("cancelled probe poisoned Docker unreachable cache: %+v", live)
	}
	if dock.snapshots != 1 {
		t.Fatalf("expected a live probe after cancel, snapshots=%d", dock.snapshots)
	}

	s.docker = blockingDocker{}
	s.InvalidateStatus()
	s.dockerSnapshotMu.Lock()
	s.dockerSnapshotValue = nil
	s.dockerSnapshotAt = time.Time{}
	s.dockerSnapshotMu.Unlock()

	ctx, cancel = context.WithCancel(context.Background())
	runtimeDone := make(chan Status, 1)
	go func() {
		runtimeDone <- s.StatusForSnapshot(ctx)
	}()
	time.Sleep(40 * time.Millisecond)
	cancel()
	select {
	case status := <-runtimeDone:
		if status.Docker.Reachable {
			t.Fatal("expected soft unreachable runtime status after cancel")
		}
	case <-time.After(DockerProbeTimeout + time.Second):
		t.Fatal("StatusForSnapshot ignored parent cancel")
	}

	dock = &countingReachableDocker{}
	s.docker = dock
	status := s.StatusForSnapshot(context.Background())
	if !status.Docker.Reachable {
		t.Fatalf("cancelled probe poisoned runtime status cache: %+v", status.Docker)
	}
	if dock.snapshots != 1 {
		t.Fatalf("expected live runtime probe after cancel, snapshots=%d", dock.snapshots)
	}

	s.docker = blockingDocker{}
	s.InvalidateStatus()
	s.dockerSnapshotMu.Lock()
	s.dockerSnapshotValue = nil
	s.dockerSnapshotAt = time.Time{}
	s.dockerSnapshotMu.Unlock()

	ctx, cancel = context.WithCancel(context.Background())
	getDone := make(chan error, 1)
	go func() {
		_, err := s.HandleRuntimeGet(ctx)
		getDone <- err
	}()
	time.Sleep(40 * time.Millisecond)
	cancel()
	select {
	case err := <-getDone:
		if err != nil {
			t.Fatalf("HandleRuntimeGet: %v", err)
		}
	case <-time.After(DockerProbeTimeout + time.Second):
		t.Fatal("HandleRuntimeGet ignored parent cancel")
	}

	dock = &countingReachableDocker{}
	s.docker = dock
	status = s.StatusForSnapshot(context.Background())
	if !status.Docker.Reachable {
		t.Fatalf("cancelled runtime.get poisoned runtime status cache: %+v", status.Docker)
	}
	if dock.snapshots != 1 {
		t.Fatalf("expected live probe after cancelled runtime.get, snapshots=%d", dock.snapshots)
	}
}
