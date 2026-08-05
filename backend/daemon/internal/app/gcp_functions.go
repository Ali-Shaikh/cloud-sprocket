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
	selected := selectedGcpFunctionKey(session, functions)

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
			"Loaded %d Cloud Function(s) via gcloud. Select one to invoke with write mode enabled.",
			len(functions),
		)
	}

	lockWorkspace(mu, func() {
		workspace.GcpFunctions = functions
		workspace.SelectedGcpFunction = selected
		workspace.GcpFunctionsStatusMessage = status
	})
}

// gcpFunctionSelectionKey uniquely identifies a function as region/name.
func gcpFunctionSelectionKey(fn models.GcpCloudFunction) string {
	region := strings.TrimSpace(fn.Region)
	name := strings.TrimSpace(fn.Name)
	if region == "" {
		return name
	}
	return region + "/" + name
}

func selectedGcpFunctionKey(session models.SessionSnapshot, functions []models.GcpCloudFunction) string {
	if session.SelectedGcpFunction == "" {
		return ""
	}
	for _, fn := range functions {
		if gcpFunctionSelectionKey(fn) == session.SelectedGcpFunction {
			return session.SelectedGcpFunction
		}
	}
	return ""
}

func (s *Service) handleGcpFunctionsSelectFunction(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		// FunctionKey is region/name (or name when region is empty).
		FunctionKey string `json:"functionKey"`
		Name        string `json:"name"`
		Region      string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	key := strings.TrimSpace(request.FunctionKey)
	if key == "" {
		name := strings.TrimSpace(request.Name)
		region := strings.TrimSpace(request.Region)
		if name != "" {
			if region != "" {
				key = region + "/" + name
			} else {
				key = name
			}
		}
	}
	snapshot, session, err := s.withLockedGcpWorkspace(ctx, "open a GCP workspace before selecting a Cloud Function", func(session *models.SessionSnapshot) error {
		session.SelectedGcpFunction = key
		return nil
	})
	if err != nil {
		return nil, err
	}
	label := key
	if label == "" {
		label = "none"
	}
	return s.finishGcpWorkspace(ctx, snapshot, session, notifier, "info", fmt.Sprintf("Selected Cloud Function %s.", label))
}

// handleGcpFunctionsCall implements gcp.functions.call (write-gated).
func (s *Service) handleGcpFunctionsCall(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
	if s.gcpFunctions == nil {
		return nil, errors.New("GCP Cloud Functions inventory is not available")
	}
	var request struct {
		Name       string `json:"name"`
		Region     string `json:"region"`
		Generation string `json:"generation"`
		Data       string `json:"data"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
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
		return nil, errors.New("open a GCP workspace before invoking a Cloud Function")
	}
	if !session.GcpWriteModeEnabled {
		return nil, errors.New(gcpWriteModeRequiredMessage)
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return nil, errors.New("the workspace's GCP profile is not available")
	}

	name := strings.TrimSpace(request.Name)
	region := strings.TrimSpace(request.Region)
	generation := strings.TrimSpace(request.Generation)
	// Fall back to the session selection and inventory when the client only
	// passes a key or omits generation metadata.
	if name == "" && session.SelectedGcpFunction != "" {
		functions, listErr := s.gcpFunctionsResult(ctx, profile)
		if listErr == nil {
			for _, fn := range functions {
				if gcpFunctionSelectionKey(fn) == session.SelectedGcpFunction {
					name = fn.Name
					if region == "" {
						region = fn.Region
					}
					if generation == "" {
						generation = fn.Generation
					}
					break
				}
			}
		}
		if name == "" {
			// region/name form without inventory match
			if idx := strings.LastIndex(session.SelectedGcpFunction, "/"); idx >= 0 {
				region = session.SelectedGcpFunction[:idx]
				name = session.SelectedGcpFunction[idx+1:]
			} else {
				name = session.SelectedGcpFunction
			}
		}
	}
	if name == "" {
		return nil, errors.New("select a Cloud Function before invoking")
	}

	actionCtx, cancel := s.withAzureTimeout(ctx)
	result, err := s.gcpFunctions.CallFunction(actionCtx, profile, name, region, generation, request.Data)
	cancel()
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"result": result,
	}, nil
}
