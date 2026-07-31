// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Package runtime owns Docker probing, emulator lifecycle, and the shared
// runtime-status caches used by Local Runtime polls and workspace assembly.
package runtime

import (
	"sync"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

const (
	// DockerProbeTimeout bounds Docker status, snapshot, and resource-listing
	// calls so an unreachable Docker engine fails fast instead of blocking the
	// request goroutine forever.
	DockerProbeTimeout = 3 * time.Second
	// DockerLogsTimeout bounds container log retrieval.
	DockerLogsTimeout = 8 * time.Second
	// DockerUnreachableCacheTTL caches an "engine unreachable" verdict so the
	// Local Runtime poll does not pay the full probe timeout on every fetch when
	// Docker is stopped.
	DockerUnreachableCacheTTL = 15 * time.Second
	// StatusCacheTTL bounds Docker/resource/emulator probe cost per workspace
	// snapshot interaction.
	StatusCacheTTL = 5 * time.Second
)

// Status is the Docker and emulator bundle embedded in workspace snapshots and
// returned by runtime.get. Cached briefly so interactive selection handlers
// avoid live probes.
type Status struct {
	Docker    models.DockerRuntimeSnapshot
	Resources []models.ManagedDockerResource
	Emulators []models.EmulatorSummary
}

// Deps holds collaborators required to construct a runtime Service.
type Deps struct {
	Settings          config.Settings
	Docker            Docker
	LocalStack        LocalStack
	AzureRuntime      AzureRuntime
	ResolveDockerHost ResolveDockerHostFunc
	Now               func() time.Time
}

// Service owns runtime probing, emulator actions, and both runtime caches.
type Service struct {
	settings          config.Settings
	docker            Docker
	localstack        LocalStack
	azureRuntime      AzureRuntime
	resolveDockerHost ResolveDockerHostFunc
	now               func() time.Time

	dockerSnapshotMu    sync.Mutex
	dockerSnapshotValue *models.DockerRuntimeSnapshot
	dockerSnapshotAt    time.Time

	statusMu    sync.Mutex
	statusValue *Status
	statusAt    time.Time
}

// New constructs a runtime Service. A nil Now function uses UTC wall clock.
// A nil ResolveDockerHost reports empty host/source on soft-unreachable fallbacks.
func New(deps Deps) *Service {
	now := deps.Now
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	resolve := deps.ResolveDockerHost
	if resolve == nil {
		resolve = func() (string, string) { return "", "" }
	}
	return &Service{
		settings:          deps.Settings,
		docker:            deps.Docker,
		localstack:        deps.LocalStack,
		azureRuntime:      deps.AzureRuntime,
		resolveDockerHost: resolve,
		now:               now,
	}
}
