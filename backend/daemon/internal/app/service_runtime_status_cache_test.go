// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
)

// countingReachableDocker tracks live Snapshot and ListOwnedResources calls for
// a reachable engine so cache behaviour is observable without a real Docker.
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

type stubLocalStackManager struct {
	starts int
	stops  int
}

func (m *stubLocalStackManager) Status(context.Context) (models.LocalStackStatus, error) {
	return models.LocalStackStatus{
		EmulatorID: "localstack",
		ProviderID: "aws",
		Label:      "LocalStack",
		Kind:       "docker",
		Status:     models.EmulatorStatusRunning,
		Summary:    "LocalStack is running.",
	}, nil
}

func (m *stubLocalStackManager) Start(context.Context, models.LocalStackStartOptions) (models.LocalStackStatus, error) {
	m.starts++
	return m.Status(context.Background())
}

func (m *stubLocalStackManager) Stop(context.Context) (models.LocalStackStatus, error) {
	m.stops++
	return models.LocalStackStatus{
		EmulatorID: "localstack",
		ProviderID: "aws",
		Label:      "LocalStack",
		Kind:       "docker",
		Status:     models.EmulatorStatusStopped,
		Summary:    "LocalStack is stopped.",
	}, nil
}

func (m *stubLocalStackManager) Logs(context.Context, int) (models.EmulatorLogSnapshot, error) {
	return models.EmulatorLogSnapshot{}, nil
}

func (m *stubLocalStackManager) EnsureManagedProfile() error {
	return nil
}

type countingAzureCLIExtensions struct {
	stubAzureInventory
	checks int
}

func (a *countingAzureCLIExtensions) CheckCLIExtensions(context.Context) []models.AzureCLIExtensionStatus {
	a.checks++
	return []models.AzureCLIExtensionStatus{
		{Name: "account", Installed: true, Summary: "installed"},
	}
}

func TestRuntimeStatusCachesReachableDockerProbes(t *testing.T) {
	dock := &countingReachableDocker{}
	clock := time.Now()
	s := &Service{
		docker: dock,
		now:    func() time.Time { return clock },
	}

	first := s.runtimeStatusForSnapshot()
	if !first.Docker.Reachable {
		t.Fatal("expected reachable Docker runtime")
	}
	if len(first.Resources) != 1 {
		t.Fatalf("expected managed resources on reachable engine, got %d", len(first.Resources))
	}
	_ = s.runtimeStatusForSnapshot()
	if dock.snapshots != 1 || dock.lists != 1 {
		t.Fatalf("expected one probe while TTL is fresh, snapshots=%d lists=%d", dock.snapshots, dock.lists)
	}

	clock = clock.Add(runtimeStatusCacheTTL + time.Second)
	_ = s.runtimeStatusForSnapshot()
	if dock.snapshots != 2 || dock.lists != 2 {
		t.Fatalf("expected re-probe after TTL, snapshots=%d lists=%d", dock.snapshots, dock.lists)
	}
}

func TestRuntimeStatusInvalidatedByEmulatorLifecycleAndRefresh(t *testing.T) {
	dock := &countingReachableDocker{}
	mgr := &stubLocalStackManager{}
	clock := time.Now()
	home := filepath.Join(t.TempDir(), "home")
	settings := config.FromEnv(map[string]string{}, "linux", home)
	if err := settings.EnsureRuntimeDirs(); err != nil {
		t.Fatalf("EnsureRuntimeDirs: %v", err)
	}
	dataStore, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = dataStore.Close() })

	s := &Service{
		docker:        dock,
		localstackMgr: mgr,
		now:           func() time.Time { return clock },
		discovery:     discovery.New(settings, func(string) (string, error) { return "", nil }),
		store:         dataStore,
		settings:      settings,
	}

	_ = s.runtimeStatusForSnapshot()
	if dock.snapshots != 1 {
		t.Fatalf("expected initial probe, got %d", dock.snapshots)
	}

	if _, err := s.emulatorsStart(context.Background(), models.LocalStackStartOptions{EmulatorID: "localstack"}); err != nil {
		t.Fatalf("emulatorsStart: %v", err)
	}
	_ = s.runtimeStatusForSnapshot()
	if dock.snapshots != 2 {
		t.Fatalf("expected start to invalidate runtime status cache, probes=%d", dock.snapshots)
	}

	if _, err := s.emulatorsStop(context.Background(), "localstack"); err != nil {
		t.Fatalf("emulatorsStop: %v", err)
	}
	_ = s.runtimeStatusForSnapshot()
	if dock.snapshots != 3 {
		t.Fatalf("expected stop to invalidate runtime status cache, probes=%d", dock.snapshots)
	}

	// runRefresh invalidates at the start; discovery may continue and build a
	// workspace (another probe). Count after the job, then confirm a subsequent
	// snapshot inside the TTL does not re-probe.
	beforeRefresh := dock.snapshots
	s.runRefresh(models.JobStatus{JobID: "job-1", Label: "Refresh"}, nil)
	if dock.snapshots <= beforeRefresh {
		t.Fatalf("expected runRefresh path to re-probe after invalidation, before=%d after=%d", beforeRefresh, dock.snapshots)
	}
	afterRefresh := dock.snapshots
	_ = s.runtimeStatusForSnapshot()
	if dock.snapshots != afterRefresh {
		t.Fatalf("expected post-refresh cache hit, probes=%d want %d", dock.snapshots, afterRefresh)
	}
}

func TestDockerRuntimeGetInvalidatesRuntimeStatusCache(t *testing.T) {
	dock := &countingReachableDocker{}
	clock := time.Now()
	s := &Service{
		docker: dock,
		now:    func() time.Time { return clock },
	}

	_ = s.runtimeStatusForSnapshot()
	if dock.snapshots != 1 {
		t.Fatalf("expected initial probe, got %d", dock.snapshots)
	}

	if _, err := s.handleDockerRuntimeGet(); err != nil {
		t.Fatalf("handleDockerRuntimeGet: %v", err)
	}
	// Manual refresh always probes Docker once itself.
	if dock.snapshots != 2 {
		t.Fatalf("expected manual Docker refresh to probe, got %d", dock.snapshots)
	}

	_ = s.runtimeStatusForSnapshot()
	if dock.snapshots != 3 {
		t.Fatalf("expected runtime status rebuild after manual refresh invalidation, probes=%d", dock.snapshots)
	}
}

func TestRuntimeGetSeedsRuntimeStatusCache(t *testing.T) {
	dock := &countingReachableDocker{}
	clock := time.Now()
	s := &Service{
		docker: dock,
		now:    func() time.Time { return clock },
	}

	if _, err := s.handleRuntimeGet(); err != nil {
		t.Fatalf("handleRuntimeGet: %v", err)
	}
	if dock.snapshots != 1 {
		t.Fatalf("expected live runtime.get probe, got %d", dock.snapshots)
	}

	_ = s.runtimeStatusForSnapshot()
	if dock.snapshots != 1 {
		t.Fatalf("expected runtime.get to seed the workspace cache, probes=%d", dock.snapshots)
	}
}

func TestAzureCLIExtensionChecksCachePerProfile(t *testing.T) {
	azure := &countingAzureCLIExtensions{}
	clock := time.Now()
	s := &Service{
		azure: azure,
		now:   func() time.Time { return clock },
	}
	snapshot := discovery.Snapshot{
		Providers: []models.ProviderSummary{
			{ProviderID: "azure", CommandPath: `C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd`},
		},
	}
	profileA := models.ProfileSummary{ProfileID: "sub-a", ProviderID: "azure", DisplayName: "A"}
	profileB := models.ProfileSummary{ProfileID: "sub-b", ProviderID: "azure", DisplayName: "B"}

	first := s.azureCLIExtensionChecks(snapshot, profileA)
	if len(first) != 1 || azure.checks != 1 {
		t.Fatalf("expected one CLI check, checks=%d statuses=%d", azure.checks, len(first))
	}
	_ = s.azureCLIExtensionChecks(snapshot, profileA)
	if azure.checks != 1 {
		t.Fatalf("expected same-profile TTL hit, checks=%d", azure.checks)
	}

	_ = s.azureCLIExtensionChecks(snapshot, profileB)
	if azure.checks != 2 {
		t.Fatalf("expected different profile to re-check, checks=%d", azure.checks)
	}

	s.invalidateAzureCLIExtensionCache()
	_ = s.azureCLIExtensionChecks(snapshot, profileB)
	if azure.checks != 3 {
		t.Fatalf("expected explicit invalidation to re-check, checks=%d", azure.checks)
	}

	clock = clock.Add(azureCLIExtensionCacheTTL + time.Second)
	_ = s.azureCLIExtensionChecks(snapshot, profileB)
	if azure.checks != 4 {
		t.Fatalf("expected TTL expiry to re-check, checks=%d", azure.checks)
	}
}

func TestAzureCLIExtensionChecksSkipsEmptyProfileCache(t *testing.T) {
	azure := &countingAzureCLIExtensions{}
	clock := time.Now()
	s := &Service{
		azure: azure,
		now:   func() time.Time { return clock },
	}
	snapshot := discovery.Snapshot{
		Providers: []models.ProviderSummary{
			{ProviderID: "azure", CommandPath: `C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd`},
		},
	}
	valid := models.ProfileSummary{ProfileID: "sub-a", ProviderID: "azure", DisplayName: "A"}
	empty := models.ProfileSummary{ProfileID: "", ProviderID: "azure", DisplayName: "blank"}

	_ = s.azureCLIExtensionChecks(snapshot, valid)
	if azure.checks != 1 {
		t.Fatalf("expected first check, got %d", azure.checks)
	}
	_ = s.azureCLIExtensionChecks(snapshot, empty)
	if azure.checks != 2 {
		t.Fatalf("expected empty profile to always probe, got %d", azure.checks)
	}
	// Cached valid profile must still hit after an empty-profile probe.
	_ = s.azureCLIExtensionChecks(snapshot, valid)
	if azure.checks != 2 {
		t.Fatalf("empty profile must not poison valid profile cache, checks=%d", azure.checks)
	}
}
