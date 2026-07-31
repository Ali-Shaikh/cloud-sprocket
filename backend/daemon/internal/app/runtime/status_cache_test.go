// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package runtime

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/dockerruntime"
	"cloudsprocket/backend/daemon/internal/models"
)

type stubLocalStack struct {
	starts int
	stops  int
}

func (m *stubLocalStack) Status(context.Context) (models.EmulatorStatusDetail, error) {
	return models.EmulatorStatusDetail{
		EmulatorID: "localstack",
		ProviderID: "aws",
		Label:      "LocalStack",
		Kind:       "docker",
		Status:     models.EmulatorStatusRunning,
		Summary:    "LocalStack is running.",
	}, nil
}

func (m *stubLocalStack) Start(context.Context, models.EmulatorStartOptions) (models.EmulatorStatusDetail, error) {
	m.starts++
	return m.Status(context.Background())
}

func (m *stubLocalStack) Stop(context.Context) (models.EmulatorStatusDetail, error) {
	m.stops++
	return models.EmulatorStatusDetail{
		EmulatorID: "localstack",
		ProviderID: "aws",
		Label:      "LocalStack",
		Kind:       "docker",
		Status:     models.EmulatorStatusStopped,
		Summary:    "LocalStack is stopped.",
	}, nil
}

func (m *stubLocalStack) Logs(context.Context, int) (models.EmulatorLogSnapshot, error) {
	return models.EmulatorLogSnapshot{}, nil
}

func (m *stubLocalStack) EnsureManagedProfile() error {
	return nil
}

func TestRuntimeStatusCachesReachableDockerProbes(t *testing.T) {
	dock := &countingReachableDocker{}
	clock := time.Now()
	s := testService(dock, func() time.Time { return clock }, config.Settings{})

	first := s.StatusForSnapshot(context.Background())
	if !first.Docker.Reachable {
		t.Fatal("expected reachable Docker runtime")
	}
	if len(first.Resources) != 1 {
		t.Fatalf("expected managed resources on reachable engine, got %d", len(first.Resources))
	}
	_ = s.StatusForSnapshot(context.Background())
	if dock.snapshots != 1 || dock.lists != 1 {
		t.Fatalf("expected one probe while TTL is fresh, snapshots=%d lists=%d", dock.snapshots, dock.lists)
	}

	clock = clock.Add(StatusCacheTTL + time.Second)
	_ = s.StatusForSnapshot(context.Background())
	if dock.snapshots != 2 || dock.lists != 2 {
		t.Fatalf("expected re-probe after TTL, snapshots=%d lists=%d", dock.snapshots, dock.lists)
	}
}

func TestRuntimeStatusInvalidatedByEmulatorLifecycleAndRefresh(t *testing.T) {
	dock := &countingReachableDocker{}
	mgr := &stubLocalStack{}
	clock := time.Now()
	home := filepath.Join(t.TempDir(), "home")
	settings := config.FromEnv(map[string]string{}, "linux", home)
	if err := settings.EnsureRuntimeDirs(); err != nil {
		t.Fatalf("EnsureRuntimeDirs: %v", err)
	}

	s := New(Deps{
		Settings:   settings,
		Docker:     dock,
		LocalStack: mgr,
		ResolveDockerHost: func() (string, string) {
			return dockerruntime.ResolveDockerHost(settings)
		},
		Now: func() time.Time { return clock },
	})

	_ = s.StatusForSnapshot(context.Background())
	if dock.snapshots != 1 {
		t.Fatalf("expected initial probe, got %d", dock.snapshots)
	}

	if _, err := s.StartEmulator(context.Background(), models.EmulatorStartOptions{EmulatorID: "localstack"}); err != nil {
		t.Fatalf("StartEmulator: %v", err)
	}
	_ = s.StatusForSnapshot(context.Background())
	if dock.snapshots != 2 {
		t.Fatalf("expected start to invalidate runtime status cache, probes=%d", dock.snapshots)
	}

	if _, err := s.StopEmulator(context.Background(), "localstack"); err != nil {
		t.Fatalf("StopEmulator: %v", err)
	}
	_ = s.StatusForSnapshot(context.Background())
	if dock.snapshots != 3 {
		t.Fatalf("expected stop to invalidate runtime status cache, probes=%d", dock.snapshots)
	}

	// Explicit invalidation (façade runRefresh / jobs) must force a re-probe.
	s.InvalidateStatus()
	_ = s.StatusForSnapshot(context.Background())
	if dock.snapshots != 4 {
		t.Fatalf("expected InvalidateStatus to force re-probe, probes=%d", dock.snapshots)
	}
	afterInvalidate := dock.snapshots
	_ = s.StatusForSnapshot(context.Background())
	if dock.snapshots != afterInvalidate {
		t.Fatalf("expected post-invalidation cache hit, probes=%d want %d", dock.snapshots, afterInvalidate)
	}
}

func TestDockerRuntimeGetInvalidatesRuntimeStatusCache(t *testing.T) {
	dock := &countingReachableDocker{}
	clock := time.Now()
	s := testService(dock, func() time.Time { return clock }, config.Settings{})

	_ = s.StatusForSnapshot(context.Background())
	if dock.snapshots != 1 {
		t.Fatalf("expected initial probe, got %d", dock.snapshots)
	}

	if _, err := s.HandleDockerRuntimeGet(context.Background()); err != nil {
		t.Fatalf("HandleDockerRuntimeGet: %v", err)
	}
	if dock.snapshots != 2 {
		t.Fatalf("expected manual Docker refresh to probe, got %d", dock.snapshots)
	}

	_ = s.StatusForSnapshot(context.Background())
	if dock.snapshots != 3 {
		t.Fatalf("expected runtime status rebuild after manual refresh invalidation, probes=%d", dock.snapshots)
	}
}

func TestRuntimeGetSeedsRuntimeStatusCache(t *testing.T) {
	dock := &countingReachableDocker{}
	clock := time.Now()
	s := testService(dock, func() time.Time { return clock }, config.Settings{})

	if _, err := s.HandleRuntimeGet(context.Background()); err != nil {
		t.Fatalf("HandleRuntimeGet: %v", err)
	}
	if dock.snapshots != 1 {
		t.Fatalf("expected live runtime.get probe, got %d", dock.snapshots)
	}

	_ = s.StatusForSnapshot(context.Background())
	if dock.snapshots != 1 {
		t.Fatalf("expected runtime.get to seed the workspace cache, probes=%d", dock.snapshots)
	}
}
