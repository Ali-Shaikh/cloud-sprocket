// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"fmt"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) gcpComputeInstancesResult(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.GcpComputeInstance, error) {
	if s.gcpCompute == nil {
		return []models.GcpComputeInstance{}, nil
	}
	const scope = "gcp.compute.instances"
	queryHash := profile.ProfileID

	if s.store != nil {
		var cached []models.GcpComputeInstance
		if fetchedAt, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
			for index := range cached {
				if cached[index].Summary == "" {
					cached[index].Summary = "Cached " + fetchedAt
				}
			}
			return cached, nil
		}
	}

	instances, err := s.gcpCompute.ListInstances(ctx, profile)
	if err == nil {
		if s.store != nil {
			fetchedAt := s.timestamp()
			if saveErr := s.saveResourceCacheWithTTL(ctx, scope, queryHash, instances); saveErr == nil {
				for index := range instances {
					if instances[index].Summary == "" {
						instances[index].Summary = "Fetched " + fetchedAt
					}
				}
			}
		}
		return instances, nil
	}

	if s.store != nil {
		var cached []models.GcpComputeInstance
		fetchedAt, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
		if cacheErr == nil && ok {
			for index := range cached {
				if cached[index].Summary == "" {
					cached[index].Summary = "Cached " + fetchedAt
				}
			}
			return cached, err
		}
	}

	return []models.GcpComputeInstance{}, err
}

func (s *Service) selectedGcpComputeInstance(
	session models.SessionSnapshot,
	instances []models.GcpComputeInstance,
) string {
	// Session does not yet persist a selected Compute instance; selection is
	// deferred until lifecycle actions land. Keep the field wired for status.
	_ = session
	if len(instances) == 0 {
		return ""
	}
	return ""
}

func (s *Service) enrichGcpComputeInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "gcp" ||
		workspace.Profile == nil ||
		s.gcpCompute == nil {
		return
	}
	if !s.isServiceEnabled("gcp", "gcp-compute") {
		return
	}

	ctx, cancel := s.withAzureTimeout(context.Background())
	defer cancel()
	profile := *workspace.Profile

	instances, listErr := s.gcpComputeInstancesResult(ctx, profile)
	selected := s.selectedGcpComputeInstance(session, instances)

	var status string
	switch {
	case listErr != nil && len(instances) == 0:
		status = fmt.Sprintf(
			"Could not list Compute Engine instances.\nCheck that gcloud is installed, authenticated, and the active configuration has a project.\nDetail: %v",
			listErr,
		)
	case len(instances) == 0:
		status = "No Compute Engine instances are currently available for this GCP project."
	default:
		status = fmt.Sprintf(
			"Loaded %d Compute Engine instance(s) via gcloud. Start/stop actions are not available yet.",
			len(instances),
		)
	}

	lockWorkspace(mu, func() {
		workspace.GcpComputeInstances = instances
		workspace.SelectedGcpComputeInstance = selected
		workspace.GcpComputeStatusMessage = status
	})
}
