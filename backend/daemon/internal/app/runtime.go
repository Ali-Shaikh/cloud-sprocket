// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import "cloudsprocket/backend/daemon/internal/models"

// handleRuntimeGet returns Docker and emulator state only. It must not call
// discovery.Discover() or buildWorkspaceSnapshot — those costs are what this
// RPC exists to avoid during Local Runtime polling. It always probes live so
// the Local Runtime tab stays fresh, then seeds the workspace snapshot cache
// so a subsequent tab switch inside the TTL costs nothing.
func (s *Service) handleRuntimeGet() (any, error) {
	status := s.probeRuntimeStatus()
	s.storeRuntimeStatus(status)
	return models.RuntimeSnapshot{
		DockerRuntime:     status.Docker,
		DockerResources:   status.Resources,
		EmulatorSummaries: status.Emulators,
		DockerDiagnostics: s.dockerDiagnosticsFromSnapshot(status.Docker),
	}, nil
}
