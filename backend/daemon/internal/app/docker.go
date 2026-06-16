package app

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"time"

	"cloudsprocket/backend/daemon/internal/models"
)

const (
	// dockerProbeTimeout bounds Docker status, snapshot, and resource-listing
	// calls so an unreachable Docker engine fails fast instead of blocking the
	// request goroutine forever. The Docker host (named pipe or socket) can be
	// configured but unreachable when the engine is stopped, in which case the
	// underlying dial would otherwise wait indefinitely.
	dockerProbeTimeout = 3 * time.Second
	// defaultAzureInventoryTimeout bounds Azure inventory calls (floci-az ARM
	// pager / `az` CLI) so a stalled response cannot hang a workspace snapshot.
	// Generous enough for real Azure, but never unbounded.
	defaultAzureInventoryTimeout = 30 * time.Second
	// dockerLogsTimeout bounds container log retrieval, which can take slightly
	// longer than a status probe but must still never hang a request.
	dockerLogsTimeout = 8 * time.Second
	// dockerUnreachableCacheTTL caches an "engine unreachable" verdict so the
	// Local Runtime poll (every few seconds) does not pay the full probe timeout
	// on every fetch when Docker is stopped. A manual "Refresh Docker" forces a
	// fresh probe, so the staleness is bounded and user-overridable.
	dockerUnreachableCacheTTL = 15 * time.Second
)

func (s *Service) dockerRuntimeSnapshot() models.DockerRuntimeSnapshot {
	if cached, ok := s.cachedUnreachableDocker(); ok {
		return cached
	}
	return s.probeDockerRuntimeSnapshot()
}

func (s *Service) cachedUnreachableDocker() (models.DockerRuntimeSnapshot, bool) {
	s.dockerSnapshotMu.Lock()
	defer s.dockerSnapshotMu.Unlock()
	if s.dockerSnapshotValue != nil &&
		!s.dockerSnapshotValue.Reachable &&
		s.now().Sub(s.dockerSnapshotAt) < dockerUnreachableCacheTTL {
		return *s.dockerSnapshotValue, true
	}
	return models.DockerRuntimeSnapshot{}, false
}

// probeDockerRuntimeSnapshot always probes the engine (bypassing the cache) and
// records the result. It backs the manual "Refresh Docker" action.

func (s *Service) probeDockerRuntimeSnapshot() models.DockerRuntimeSnapshot {
	snapshot := s.buildDockerRuntimeSnapshot()
	s.dockerSnapshotMu.Lock()
	cached := snapshot
	s.dockerSnapshotValue = &cached
	s.dockerSnapshotAt = s.now()
	s.dockerSnapshotMu.Unlock()
	return snapshot
}

func (s *Service) buildDockerRuntimeSnapshot() models.DockerRuntimeSnapshot {
	if s.docker != nil {
		ctx, cancel := context.WithTimeout(context.Background(), dockerProbeTimeout)
		defer cancel()
		snapshot, err := s.docker.Snapshot(ctx)
		if err == nil {
			return snapshot
		}
	}

	host, source := s.detectDockerHost()
	contextName := strings.TrimSpace(os.Getenv("DOCKER_CONTEXT"))
	summary := "Docker engine was not detected in the current local runtime."
	if host != "" {
		summary = "Docker engine endpoint was detected, but live runtime probing is unavailable."
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

func (s *Service) dockerResources() []models.ManagedDockerResource {
	if s.docker == nil {
		return []models.ManagedDockerResource{}
	}
	ctx, cancel := context.WithTimeout(context.Background(), dockerProbeTimeout)
	defer cancel()
	resources, err := s.docker.ListOwnedResources(ctx)
	if err != nil {
		return []models.ManagedDockerResource{}
	}
	return resources
}

func (s *Service) dockerDiagnostics() models.DockerDiagnostics {
	return s.dockerDiagnosticsFromSnapshot(s.dockerRuntimeSnapshot())
}

func (s *Service) dockerDiagnosticsFromSnapshot(runtime models.DockerRuntimeSnapshot) models.DockerDiagnostics {
	state := models.DockerEngineStateUnknown
	if runtime.Host != "" {
		state = models.DockerEngineStateUnavailable
	}
	if runtime.Reachable {
		state = models.DockerEngineStateAvailable
	}
	details := append([]models.DetailField{}, runtime.Details...)
	if s.settings.PlatformName == "windows" && runtime.Host == "" {
		details = append(details, models.DetailField{
			Label: "Note",
			Value: "Windows named-pipe verification is deferred until the Docker runtime slice.",
		})
	}

	return models.DockerDiagnostics{
		EngineState: state,
		Summary:     runtime.Summary,
		ContextName: runtime.ContextName,
		Host:        runtime.Host,
		Details:     details,
	}
}

func (s *Service) detectDockerHost() (string, string) {
	if host := strings.TrimSpace(os.Getenv("DOCKER_HOST")); host != "" {
		return host, "DOCKER_HOST"
	}

	if s.settings.PlatformName == "windows" {
		return "", "No named-pipe probe in foundation slice"
	}

	candidates := []string{}
	if home := strings.TrimSpace(s.settings.HomeDir); home != "" {
		if s.settings.PlatformName == "linux" {
			candidates = append(candidates,
				filepath.Join(home, ".docker", "desktop", "docker.sock"),
			)
			if runtimeDir := strings.TrimSpace(os.Getenv("XDG_RUNTIME_DIR")); runtimeDir != "" {
				candidates = append(candidates, filepath.Join(runtimeDir, "docker.sock"))
			}
		}
		if s.settings.PlatformName == "macos" {
			candidates = append(candidates, filepath.Join(home, ".docker", "run", "docker.sock"))
		}
	}
	candidates = append(candidates, "/var/run/docker.sock")

	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return "unix://" + candidate, "Local socket"
		}
	}

	return "", "No Docker host detected"
}

func (s *Service) handleDockerRuntimeGet() (any, error) {
	// Manual refresh forces a fresh probe (bypassing the unreachable cache).
	return s.probeDockerRuntimeSnapshot(), nil
}

func (s *Service) handleDockerResourcesList() (any, error) {
	return s.dockerResources(), nil
}
