// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package runtime

import (
	"context"
	"errors"
	"os"
	"strings"
	"time"

	"cloudsprocket/backend/daemon/internal/models"
)

// probeCancelled reports whether a Docker/runtime probe should be treated as a
// soft cancellation rather than a genuine engine failure. Cancelled request
// contexts must not seed the shared unreachable/runtime caches.
func probeCancelled(ctx context.Context, err error) bool {
	if err != nil && errors.Is(err, context.Canceled) {
		return true
	}
	return ctx != nil && ctx.Err() != nil
}

func (s *Service) dockerRuntimeSnapshot(ctx context.Context) models.DockerRuntimeSnapshot {
	if cached, ok := s.cachedUnreachableDocker(); ok {
		return cached
	}
	return s.probeDockerRuntimeSnapshot(ctx)
}

func (s *Service) cachedUnreachableDocker() (models.DockerRuntimeSnapshot, bool) {
	s.dockerSnapshotMu.Lock()
	defer s.dockerSnapshotMu.Unlock()
	if s.dockerSnapshotValue != nil &&
		!s.dockerSnapshotValue.Reachable &&
		s.now().Sub(s.dockerSnapshotAt) < DockerUnreachableCacheTTL {
		return *s.dockerSnapshotValue, true
	}
	return models.DockerRuntimeSnapshot{}, false
}

// ProbeDockerRuntimeSnapshot always probes the engine (bypassing the unreachable
// cache) and records the result. It backs the manual "Refresh Docker" action.
func (s *Service) ProbeDockerRuntimeSnapshot(ctx context.Context) models.DockerRuntimeSnapshot {
	return s.probeDockerRuntimeSnapshot(ctx)
}

func (s *Service) probeDockerRuntimeSnapshot(ctx context.Context) models.DockerRuntimeSnapshot {
	snapshot := s.buildDockerRuntimeSnapshot(ctx)
	if snapshot.Reachable || !probeCancelled(ctx, nil) {
		s.dockerSnapshotMu.Lock()
		cached := snapshot
		s.dockerSnapshotValue = &cached
		s.dockerSnapshotAt = s.now()
		s.dockerSnapshotMu.Unlock()
	}
	return snapshot
}

func (s *Service) buildDockerRuntimeSnapshot(ctx context.Context) models.DockerRuntimeSnapshot {
	if s.docker != nil {
		probeCtx, cancel := context.WithTimeout(ctx, DockerProbeTimeout)
		defer cancel()
		snapshot, err := s.docker.Snapshot(probeCtx)
		if err == nil {
			return snapshot
		}
		if probeCancelled(ctx, err) {
			return s.softUnreachableDockerSnapshot("Docker probe was cancelled before the engine responded.")
		}
	}
	return s.softUnreachableDockerSnapshot("")
}

func (s *Service) softUnreachableDockerSnapshot(summaryOverride string) models.DockerRuntimeSnapshot {
	host, source := s.resolveDockerHost()
	contextName := strings.TrimSpace(os.Getenv("DOCKER_CONTEXT"))
	summary := strings.TrimSpace(summaryOverride)
	if summary == "" {
		summary = "Docker engine was not detected in the current local runtime."
		if host != "" {
			summary = "Docker engine endpoint was detected, but live runtime probing is unavailable."
		}
	}

	return models.DockerRuntimeSnapshot{
		Reachable:   false,
		Host:        host,
		HostSource:  source,
		ContextName: contextName,
		EngineName:  "docker",
		ResourceOwnership: models.DockerOwnershipPolicy{
			LabelKey:        "com.cloudsprocket.managed",
			LabelValue:      "true",
			ProjectLabelKey: "com.cloudsprocket.project",
			ProjectName:     "cloud-sprocket",
			Summary:         "Only CloudSprocket-managed Docker resources are eligible for future lifecycle control.",
		},
		Summary: summary,
		Details: []models.DetailField{
			{Label: "Host Source", Value: firstNonEmpty(source, "Not detected")},
			{Label: "Host", Value: firstNonEmpty(host, "Not detected")},
			{Label: "Context", Value: firstNonEmpty(contextName, "Default context")},
		},
	}
}

func (s *Service) dockerResources(ctx context.Context) []models.ManagedDockerResource {
	if s.docker == nil {
		return []models.ManagedDockerResource{}
	}
	probeCtx, cancel := context.WithTimeout(ctx, DockerProbeTimeout)
	defer cancel()
	resources, err := s.docker.ListOwnedResources(probeCtx)
	if err != nil {
		return []models.ManagedDockerResource{}
	}
	return resources
}

// DiagnosticsFromSnapshot derives Docker engine diagnostics from a snapshot.
func DiagnosticsFromSnapshot(runtime models.DockerRuntimeSnapshot) models.DockerDiagnostics {
	state := models.DockerEngineStateUnknown
	if runtime.Host != "" {
		state = models.DockerEngineStateUnavailable
	}
	if runtime.Reachable {
		state = models.DockerEngineStateAvailable
	}
	details := append([]models.DetailField{}, runtime.Details...)

	return models.DockerDiagnostics{
		EngineState: state,
		Summary:     runtime.Summary,
		ContextName: runtime.ContextName,
		Host:        runtime.Host,
		Details:     details,
	}
}

// StatusForSnapshot returns the cached or freshly probed runtime status used by
// workspace snapshot assembly.
func (s *Service) StatusForSnapshot(ctx context.Context) Status {
	s.statusMu.Lock()
	if s.statusValue != nil && s.now().Sub(s.statusAt) < StatusCacheTTL {
		status := *s.statusValue
		s.statusMu.Unlock()
		return status
	}
	s.statusMu.Unlock()

	status := s.probeStatus(ctx)
	if !probeCancelled(ctx, nil) {
		s.statusMu.Lock()
		cached := status
		s.statusValue = &cached
		s.statusAt = s.now()
		s.statusMu.Unlock()
	}
	return status
}

// ProbeStatus always performs the live Docker / resource / emulator sequence.
func (s *Service) ProbeStatus(ctx context.Context) Status {
	return s.probeStatus(ctx)
}

func (s *Service) probeStatus(ctx context.Context) Status {
	dockerRuntime := s.dockerRuntimeSnapshot(ctx)
	dockerResources := []models.ManagedDockerResource{}
	emulatorSummaries := s.plannedEmulatorSummaries()
	if dockerRuntime.Reachable {
		dockerResources = s.dockerResources(ctx)
		emulatorSummaries = s.emulatorsList(ctx)
	}
	return Status{
		Docker:    dockerRuntime,
		Resources: dockerResources,
		Emulators: emulatorSummaries,
	}
}

func (s *Service) storeStatus(status Status) {
	s.statusMu.Lock()
	defer s.statusMu.Unlock()
	cached := status
	s.statusValue = &cached
	s.statusAt = s.now()
}

// InvalidateStatus drops the broader runtime-status bundle so the next workspace
// snapshot rebuild re-probes resources and emulators.
func (s *Service) InvalidateStatus() {
	s.statusMu.Lock()
	defer s.statusMu.Unlock()
	s.statusValue = nil
	s.statusAt = time.Time{}
}
