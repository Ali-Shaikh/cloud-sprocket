// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"fmt"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) gcpStorageBucketsResult(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.GcpStorageBucket, error) {
	if s.gcpStorage == nil {
		return []models.GcpStorageBucket{}, nil
	}
	const scope = "gcp.storage.buckets"
	queryHash := profile.ProfileID

	if s.store != nil {
		var cached []models.GcpStorageBucket
		if fetchedAt, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
			for index := range cached {
				if cached[index].Summary == "" {
					cached[index].Summary = "Cached " + fetchedAt
				}
			}
			return cached, nil
		}
	}

	buckets, err := s.gcpStorage.ListBuckets(ctx, profile)
	if err == nil {
		if s.store != nil {
			fetchedAt := s.timestamp()
			if saveErr := s.saveResourceCacheWithTTL(ctx, scope, queryHash, buckets); saveErr == nil {
				for index := range buckets {
					if buckets[index].Summary == "" {
						buckets[index].Summary = "Fetched " + fetchedAt
					}
				}
			}
		}
		return buckets, nil
	}

	if s.store != nil {
		var cached []models.GcpStorageBucket
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

	return []models.GcpStorageBucket{}, err
}

func (s *Service) selectedGcpStorageBucket(
	session models.SessionSnapshot,
	buckets []models.GcpStorageBucket,
) string {
	// Session does not yet persist a selected GCS bucket; first-list selection
	// is deferred until object browsing lands. Keep the field wired for status.
	_ = session
	if len(buckets) == 0 {
		return ""
	}
	return ""
}

func (s *Service) enrichGcpStorageInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "gcp" ||
		workspace.Profile == nil ||
		s.gcpStorage == nil {
		return
	}
	if !s.isServiceEnabled("gcp", "gcp-storage") {
		return
	}

	ctx, cancel := s.withAzureTimeout(context.Background())
	defer cancel()
	profile := *workspace.Profile

	buckets, listErr := s.gcpStorageBucketsResult(ctx, profile)
	selected := s.selectedGcpStorageBucket(session, buckets)

	var status string
	switch {
	case listErr != nil && len(buckets) == 0:
		status = fmt.Sprintf(
			"Could not list Cloud Storage buckets.\nCheck that gcloud is installed, authenticated, and the active configuration has a project.\nDetail: %v",
			listErr,
		)
	case len(buckets) == 0:
		status = "No Cloud Storage buckets are currently available for this GCP project."
	default:
		status = fmt.Sprintf(
			"Loaded %d Cloud Storage bucket(s) via gcloud. Object browsing is not available yet.",
			len(buckets),
		)
	}

	lockWorkspace(mu, func() {
		workspace.GcpStorageBuckets = buckets
		workspace.SelectedGcpStorageBucket = selected
		workspace.GcpStorageStatusMessage = status
	})
}

// enrichGcpWorkspace loads enabled GCP service inventories for a workspace snapshot.
func (s *Service) enrichGcpWorkspace(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "gcp" ||
		workspace.Profile == nil {
		return
	}
	s.enrichGcpStorageInventory(workspace, session, nil)
}
