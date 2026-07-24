// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"

	"cloudsprocket/backend/daemon/internal/models"
)

// handleRuntimeGet returns Docker and emulator state only. It must not call
// discovery.Discover() or buildWorkspaceSnapshot — those costs are what this
// RPC exists to avoid during Local Runtime polling. It always probes live so
// the Local Runtime tab stays fresh, then seeds the workspace snapshot cache
// so a subsequent tab switch inside the TTL costs nothing.
func (s *Service) handleRuntimeGet(ctx context.Context) (any, error) {
	status := s.probeRuntimeStatus(ctx)
	// Seed the workspace snapshot cache only for completed probes. A cancelled
	// Local Runtime poll can return Docker reachable with incomplete
	// resources/emulators and must not become the shared TTL snapshot.
	if !probeCancelled(ctx, nil) {
		s.storeRuntimeStatus(status)
	}
	return models.RuntimeSnapshot{
		DockerRuntime:     status.Docker,
		DockerResources:   status.Resources,
		EmulatorSummaries: status.Emulators,
		DockerDiagnostics: s.dockerDiagnosticsFromSnapshot(status.Docker),
	}, nil
}
