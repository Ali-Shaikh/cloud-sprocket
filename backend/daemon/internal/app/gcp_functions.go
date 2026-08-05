// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"fmt"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) gcpFunctionsResult(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.GcpCloudFunction, error) {
	if s.gcpFunctions == nil {
		return []models.GcpCloudFunction{}, nil
	}
	const scope = "gcp.functions.list"
	queryHash := profile.ProfileID

	if s.store != nil {
		var cached []models.GcpCloudFunction
		if fetchedAt, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
			for index := range cached {
				if cached[index].Summary == "" {
					cached[index].Summary = "Cached " + fetchedAt
				}
			}
			return cached, nil
		}
	}

	functions, err := s.gcpFunctions.ListFunctions(ctx, profile)
	if err == nil {
		if s.store != nil {
			fetchedAt := s.timestamp()
			if saveErr := s.saveResourceCacheWithTTL(ctx, scope, queryHash, functions); saveErr == nil {
				for index := range functions {
					if functions[index].Summary == "" {
						functions[index].Summary = "Fetched " + fetchedAt
					}
				}
			}
		}
		return functions, nil
	}

	if s.store != nil {
		var cached []models.GcpCloudFunction
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

	return []models.GcpCloudFunction{}, err
}

func (s *Service) enrichGcpFunctionsInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "gcp" ||
		workspace.Profile == nil ||
		s.gcpFunctions == nil {
		return
	}
	if !s.isServiceEnabled("gcp", "gcp-functions") {
		return
	}

	ctx, cancel := s.withAzureTimeout(context.Background())
	defer cancel()
	profile := *workspace.Profile

	functions, listErr := s.gcpFunctionsResult(ctx, profile)
	_ = session // selection deferred until invoke actions land

	var status string
	switch {
	case listErr != nil && len(functions) == 0:
		status = fmt.Sprintf(
			"Could not list Cloud Functions.\nCheck that gcloud is installed, authenticated, and the Cloud Functions API is enabled for the project.\nDetail: %v",
			listErr,
		)
	case len(functions) == 0:
		status = "No Cloud Functions are currently available for this GCP project."
	default:
		status = fmt.Sprintf(
			"Loaded %d Cloud Function(s) via gcloud. Invoke and lifecycle actions are not available yet.",
			len(functions),
		)
	}

	lockWorkspace(mu, func() {
		workspace.GcpFunctions = functions
		workspace.SelectedGcpFunction = ""
		workspace.GcpFunctionsStatusMessage = status
	})
}
