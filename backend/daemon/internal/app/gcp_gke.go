// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
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

func (s *Service) gcpGkeNodePoolsResult(
	ctx context.Context,
	profile models.ProfileSummary,
	clusterName string,
	location string,
) ([]models.GcpGkeNodePool, error) {
	if s.gcpGke == nil || strings.TrimSpace(clusterName) == "" || strings.TrimSpace(location) == "" {
		return []models.GcpGkeNodePool{}, nil
	}
	const scope = "gcp.gke.nodePools"
	queryHash := profile.ProfileID + "|" + clusterName + "|" + location

	if s.store != nil {
		var cached []models.GcpGkeNodePool
		if fetchedAt, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
			for index := range cached {
				if cached[index].Summary == "" {
					cached[index].Summary = "Cached " + fetchedAt
				}
			}
			return cached, nil
		}
	}

	pools, err := s.gcpGke.ListNodePools(ctx, profile, clusterName, location)
	if err == nil {
		if s.store != nil {
			fetchedAt := s.timestamp()
			if saveErr := s.saveResourceCacheWithTTL(ctx, scope, queryHash, pools); saveErr == nil {
				for index := range pools {
					if pools[index].Summary == "" {
						pools[index].Summary = "Fetched " + fetchedAt
					}
				}
			}
		}
		return pools, nil
	}

	if s.store != nil {
		var cached []models.GcpGkeNodePool
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

	return []models.GcpGkeNodePool{}, err
}

func findGcpGkeCluster(clusters []models.GcpGkeCluster, name, location string) (models.GcpGkeCluster, bool) {
	var selected models.GcpGkeCluster
	var found bool
	for _, cluster := range clusters {
		if cluster.Name != name || (location != "" && cluster.Location != location) {
			continue
		}
		if found {
			return models.GcpGkeCluster{}, false
		}
		selected, found = cluster, true
	}
	return selected, found
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
	selectedCluster, found := findGcpGkeCluster(clusters, session.SelectedGcpGkeCluster, session.SelectedGcpGkeClusterLocation)

	var pools []models.GcpGkeNodePool
	var poolsErr error
	if found {
		pools, poolsErr = s.gcpGkeNodePoolsResult(ctx, profile, selectedCluster.Name, selectedCluster.Location)
	}

	var status string
	switch {
	case listErr != nil && len(clusters) == 0:
		status = fmt.Sprintf(
			"Could not list GKE clusters.\nCheck that gcloud is installed, authenticated, and the Kubernetes Engine API is enabled for the project.\nDetail: %v",
			listErr,
		)
	case listErr != nil:
		status = gcpCachedInventoryStatus("GKE cluster(s)", len(clusters), listErr)
	case len(clusters) == 0:
		status = "No GKE clusters are currently available for this GCP project."
	case !found:
		status = fmt.Sprintf(
			"Loaded %d GKE cluster(s) via gcloud. Select a cluster to list node pools.",
			len(clusters),
		)
	case poolsErr != nil && len(pools) == 0:
		status = fmt.Sprintf(
			"Loaded cluster %s but could not list node pools.\nDetail: %v",
			selectedCluster.Name,
			poolsErr,
		)
	default:
		status = fmt.Sprintf(
			"Loaded %d node pool(s) for cluster %s.",
			len(pools),
			selectedCluster.Name,
		)
	}

	lockWorkspace(mu, func() {
		workspace.GcpGkeClusters = clusters
		workspace.SelectedGcpGkeCluster = selectedCluster.Name
		workspace.SelectedGcpGkeClusterLocation = selectedCluster.Location
		workspace.GcpGkeNodePools = pools
		workspace.GcpGkeStatusMessage = status
		markGcpInventory(workspace, "gke", len(clusters), gcpInventoryListEmptyReason(len(clusters), listErr))
	})
}

// handleGcpGkeSelectCluster implements gcp.gke.selectCluster.
func (s *Service) handleGcpGkeSelectCluster(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		ClusterName string `json:"clusterName"`
		Location    string `json:"location"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	clusterName := strings.TrimSpace(request.ClusterName)
	snapshot, session, err := s.withLockedGcpWorkspace(ctx, "open a GCP workspace before selecting a GKE cluster", func(session *models.SessionSnapshot) error {
		session.SelectedGcpGkeCluster = clusterName
		session.SelectedGcpGkeClusterLocation = strings.TrimSpace(request.Location)
		return nil
	})
	if err != nil {
		return nil, err
	}
	// Node pools are per-cluster; invalidate so the next enrich reloads them.
	s.invalidateResourceCacheScope(ctx, "gcp.gke.nodePools")
	label := clusterName
	if label == "" {
		label = "none"
	}
	return s.finishGcpWorkspace(ctx, snapshot, session, notifier, "info", fmt.Sprintf("Selected GKE cluster %s.", label))
}

func (s *Service) handleGcpGkeGetCredentials(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if s.gcpGke == nil {
		return nil, errors.New("GKE inventory is not available")
	}
	var request struct {
		ClusterName string `json:"clusterName"`
		Location    string `json:"location"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(request.ClusterName)
	location := strings.TrimSpace(request.Location)
	if name == "" || location == "" {
		return nil, errors.New("a GKE cluster name and location are required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, err := s.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	if !session.IsLocked || session.CurrentProviderID != "gcp" {
		return nil, errors.New("open a locked GCP workspace before getting GKE credentials")
	}
	if !session.GcpWriteModeEnabled {
		return nil, errors.New(gcpWriteModeRequiredMessage)
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, "gcp"), session.SelectedProfileID)
	if !ok {
		return nil, errors.New("the workspace's GCP profile is not available")
	}
	actionCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	clusters, err := s.gcpGkeClustersResult(actionCtx, profile)
	if err != nil {
		return nil, err
	}
	selected, ok := findGcpGkeCluster(clusters, session.SelectedGcpGkeCluster, session.SelectedGcpGkeClusterLocation)
	if !ok || selected.Name != name || selected.Location != location {
		return nil, errors.New("select the GKE cluster and location before getting credentials")
	}
	if err := s.gcpGke.GetClusterCredentials(actionCtx, profile, name, location); err != nil {
		return nil, err
	}
	message := fmt.Sprintf("Updated kubeconfig for GKE cluster %s in %s.", name, location)
	return map[string]string{"message": message}, s.AppendActivity(ctx, notifier, "success", message)
}
