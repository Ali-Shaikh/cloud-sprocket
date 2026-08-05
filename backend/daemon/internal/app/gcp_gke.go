// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"fmt"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) gcpGkeClustersResult(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.GcpGkeCluster, error) {
	if s.gcpGke == nil {
		return []models.GcpGkeCluster{}, nil
	}
	const scope = "gcp.gke.clusters"
	queryHash := profile.ProfileID

	if s.store != nil {
		var cached []models.GcpGkeCluster
		if fetchedAt, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
			for index := range cached {
				if cached[index].Summary == "" {
					cached[index].Summary = "Cached " + fetchedAt
				}
			}
			return cached, nil
		}
	}

	clusters, err := s.gcpGke.ListClusters(ctx, profile)
	if err == nil {
		if s.store != nil {
			fetchedAt := s.timestamp()
			if saveErr := s.saveResourceCacheWithTTL(ctx, scope, queryHash, clusters); saveErr == nil {
				for index := range clusters {
					if clusters[index].Summary == "" {
						clusters[index].Summary = "Fetched " + fetchedAt
					}
				}
			}
		}
		return clusters, nil
	}

	if s.store != nil {
		var cached []models.GcpGkeCluster
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

	return []models.GcpGkeCluster{}, err
}

func (s *Service) enrichGcpGkeInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "gcp" ||
		workspace.Profile == nil ||
		s.gcpGke == nil {
		return
	}
	if !s.isServiceEnabled("gcp", "gcp-gke") {
		return
	}

	ctx, cancel := s.withAzureTimeout(context.Background())
	defer cancel()
	profile := *workspace.Profile

	clusters, listErr := s.gcpGkeClustersResult(ctx, profile)
	_ = session // selection deferred until cluster actions land

	var status string
	switch {
	case listErr != nil && len(clusters) == 0:
		status = fmt.Sprintf(
			"Could not list GKE clusters.\nCheck that gcloud is installed, authenticated, and the Kubernetes Engine API is enabled for the project.\nDetail: %v",
			listErr,
		)
	case len(clusters) == 0:
		status = "No GKE clusters are currently available for this GCP project."
	default:
		status = fmt.Sprintf(
			"Loaded %d GKE cluster(s) via gcloud. Node pool and credentials actions are not available yet.",
			len(clusters),
		)
	}

	lockWorkspace(mu, func() {
		workspace.GcpGkeClusters = clusters
		workspace.SelectedGcpGkeCluster = ""
		workspace.GcpGkeStatusMessage = status
	})
}
