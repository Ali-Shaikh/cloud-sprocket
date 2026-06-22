// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import "cloudsprocket/backend/daemon/internal/models"

// handleRuntimeGet returns Docker and emulator state only. It must not call
// discovery.Discover() or buildWorkspaceSnapshot — those costs are what this
// RPC exists to avoid during Local Runtime polling.
func (s *Service) handleRuntimeGet() (any, error) {
	dockerRuntime := s.dockerRuntimeSnapshot()
	dockerResources := []models.ManagedDockerResource{}
	emulatorSummaries := s.emulatorSummaries()
	if dockerRuntime.Reachable {
		dockerResources = s.dockerResources()
		emulatorSummaries = s.emulatorsList()
	}
	return models.RuntimeSnapshot{
		DockerRuntime:     dockerRuntime,
		DockerResources:   dockerResources,
		EmulatorSummaries: emulatorSummaries,
		DockerDiagnostics: s.dockerDiagnosticsFromSnapshot(dockerRuntime),
	}, nil
}