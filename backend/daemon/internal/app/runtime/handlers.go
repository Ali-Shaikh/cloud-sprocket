// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package runtime

import (
	"context"
	"encoding/json"
	"fmt"

	"cloudsprocket/backend/daemon/internal/models"
)

// HandleRuntimeGet returns Docker and emulator state only. It always probes
// live so the Local Runtime tab stays fresh, then seeds the workspace snapshot
// cache so a subsequent tab switch inside the TTL costs nothing.
func (s *Service) HandleRuntimeGet(ctx context.Context) (any, error) {
	status := s.probeStatus(ctx)
	if !probeCancelled(ctx, nil) {
		s.storeStatus(status)
	}
	return models.RuntimeSnapshot{
		DockerRuntime:     status.Docker,
		DockerResources:   status.Resources,
		EmulatorSummaries: status.Emulators,
		DockerDiagnostics: DiagnosticsFromSnapshot(status.Docker),
	}, nil
}

// HandleDockerRuntimeGet forces a fresh Docker probe and invalidates the
// broader runtime-status bundle.
func (s *Service) HandleDockerRuntimeGet(ctx context.Context) (any, error) {
	snapshot := s.probeDockerRuntimeSnapshot(ctx)
	s.InvalidateStatus()
	return snapshot, nil
}

// HandleDockerResourcesList returns managed Docker resources.
func (s *Service) HandleDockerResourcesList(ctx context.Context) (any, error) {
	return s.dockerResources(ctx), nil
}

// HandleEmulatorsList returns live emulator summaries.
func (s *Service) HandleEmulatorsList(ctx context.Context) (any, error) {
	return s.emulatorsList(ctx), nil
}

// HandleEmulatorsPrepareProfile prepares LocalStack or floci-az managed config.
func (s *Service) HandleEmulatorsPrepareProfile(ctx context.Context, params json.RawMessage) (any, error) {
	var request struct {
		EmulatorID string `json:"emulatorId"`
	}
	_ = json.Unmarshal(params, &request)
	result, err := s.emulatorsPrepareProfile(ctx, request.EmulatorID)
	if err != nil {
		return nil, err
	}
	return result, nil
}

// HandleEmulatorsStart starts an emulator.
func (s *Service) HandleEmulatorsStart(ctx context.Context, params json.RawMessage) (any, error) {
	var request models.EmulatorStartOptions
	_ = json.Unmarshal(params, &request)
	return s.emulatorsStart(ctx, request)
}

// HandleEmulatorsStop stops an emulator.
func (s *Service) HandleEmulatorsStop(ctx context.Context, params json.RawMessage) (any, error) {
	var request struct {
		EmulatorID string `json:"emulatorId"`
	}
	_ = json.Unmarshal(params, &request)
	return s.emulatorsStop(ctx, request.EmulatorID)
}

// HandleEmulatorsLogs returns recent container logs for an emulator.
func (s *Service) HandleEmulatorsLogs(ctx context.Context, params json.RawMessage) (any, error) {
	var request struct {
		EmulatorID string `json:"emulatorId"`
		Tail       int    `json:"tail"`
	}
	_ = json.Unmarshal(params, &request)
	if request.EmulatorID != "" && request.EmulatorID != "localstack" && request.EmulatorID != "floci-az" {
		return nil, fmt.Errorf("emulator %s is not supported", request.EmulatorID)
	}
	return s.emulatorsLogs(ctx, request.EmulatorID, request.Tail)
}
