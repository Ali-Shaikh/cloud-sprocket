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

func (s *Service) azureLogAnalyticsWorkspaces(
	ctx context.Context,
	profile models.ProfileSummary,
) []models.AzureLogAnalyticsWorkspace {
	const scope = "azure.log-analytics-workspaces"
	queryHash := profile.ProfileID
	workspaces, err := s.azure.ListLogAnalyticsWorkspaces(ctx, profile)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, workspaces, s.timestamp())
		return workspaces
	}
	var cached []models.AzureLogAnalyticsWorkspace
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AzureLogAnalyticsWorkspace{}
}

func (s *Service) selectedAzureLogWorkspace(
	session models.SessionSnapshot,
	workspaces []models.AzureLogAnalyticsWorkspace,
) string {
	if session.SelectedAzureLogWorkspace != "" {
		for _, workspace := range workspaces {
			if workspace.Name == session.SelectedAzureLogWorkspace ||
				workspace.CustomerID == session.SelectedAzureLogWorkspace {
				return session.SelectedAzureLogWorkspace
			}
		}
	}
	if len(workspaces) == 0 {
		return ""
	}
	return workspaces[0].Name
}

// azureLogAnalyticsQueryWorkspace resolves a workspace selection (a name or a
// GUID) to the workspace customer GUID the query API expects. requireGUID is set
// for real Azure, where `az monitor log-analytics query -w` only accepts the
// customer GUID; the local floci path accepts a name too, so it stays relaxed.
func azureLogAnalyticsQueryWorkspace(
	selection string,
	workspaces []models.AzureLogAnalyticsWorkspace,
	requireGUID bool,
) (string, error) {
	selection = strings.TrimSpace(selection)
	for _, workspace := range workspaces {
		if workspace.Name == selection || workspace.CustomerID == selection {
			if customerID := strings.TrimSpace(workspace.CustomerID); customerID != "" {
				return customerID, nil
			}
			if requireGUID {
				return "", fmt.Errorf("workspace %q has no customer ID; reload the workspace list and try again", workspace.Name)
			}
			return workspace.Name, nil
		}
	}
	// The selection was not in the loaded list. Accept a directly typed GUID,
	// but on cloud reject a bare name since `-w` would fail with it.
	if requireGUID && !looksLikeWorkspaceGUID(selection) {
		return "", fmt.Errorf("could not resolve a workspace GUID for %q; pick a workspace from the list", selection)
	}
	return selection, nil
}

// looksLikeWorkspaceGUID reports whether value is an 8-4-4-4-12 hex GUID.
func looksLikeWorkspaceGUID(value string) bool {
	value = strings.TrimSpace(value)
	if len(value) != 36 {
		return false
	}
	for i, r := range value {
		switch i {
		case 8, 13, 18, 23:
			if r != '-' {
				return false
			}
		default:
			isHex := (r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F')
			if !isHex {
				return false
			}
		}
	}
	return true
}

func (s *Service) enrichAzureLogAnalyticsInventory(workspace *models.WorkspaceSnapshot, session models.SessionSnapshot, mu *sync.Mutex) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "azure" ||
		workspace.Profile == nil ||
		s.azure == nil {
		return
	}
	ctx, cancel := s.withAzureTimeout(context.Background())
	defer cancel()
	workspaces := s.azureLogAnalyticsWorkspaces(ctx, *workspace.Profile)
	selected := s.selectedAzureLogWorkspace(session, workspaces)

	var status string
	if len(workspaces) == 0 {
		status = "No Log Analytics workspaces found. Create one, then run KQL queries here."
	} else {
		status = fmt.Sprintf(
			"Loaded %d Log Analytics workspace(s). Local KQL is a subset of Azure KQL.",
			len(workspaces),
		)
	}
	lockWorkspace(mu, func() {
		workspace.AzureLogAnalyticsWorkspaces = workspaces
		workspace.SelectedAzureLogWorkspace = selected
		workspace.AzureLogAnalyticsStatusMessage = status
	})
}

func (s *Service) handleAzureLogAnalyticsSelectWorkspace(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
	var request struct {
		Workspace string `json:"workspace"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	_, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a Log Analytics workspace", func(session *models.SessionSnapshot) error {
		session.SelectedAzureLogWorkspace = strings.TrimSpace(request.Workspace)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return models.AzureLogAnalyticsSelectionResult{Workspace: session.SelectedAzureLogWorkspace}, nil
}

func (s *Service) handleAzureLogAnalyticsQuery(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
	var request struct {
		Workspace string `json:"workspace"`
		Query     string `json:"query"`
		Timespan  string `json:"timespan"`
		MaxRows   int    `json:"maxRows"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	if strings.TrimSpace(request.Query) == "" {
		return nil, errors.New("a KQL query is required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !session.IsLocked || session.CurrentProviderID != "azure" {
		s.mu.Unlock()
		return nil, errors.New("open a locked Azure workspace before running a query")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		s.mu.Unlock()
		return nil, errors.New("the workspace's Azure profile is not available")
	}
	s.mu.Unlock()

	workspaces := s.azureLogAnalyticsWorkspaces(ctx, profile)
	requestedWorkspace := strings.TrimSpace(request.Workspace)
	if requestedWorkspace == "" {
		requestedWorkspace = s.selectedAzureLogWorkspace(session, workspaces)
	}
	if requestedWorkspace == "" {
		return nil, errors.New("select a Log Analytics workspace before running a query")
	}
	workspace, err := azureLogAnalyticsQueryWorkspace(requestedWorkspace, workspaces, !isLocalFlociProfile(profile))
	if err != nil {
		return nil, err
	}

	// The adapter bounds the query itself; do not also wrap in the shorter inventory timeout.
	result, err := s.azure.RunLogAnalyticsQuery(ctx, profile, workspace, request.Query, request.Timespan, request.MaxRows)
	if err == nil {
		s.appendLogAnalyticsHistory(ctx, requestedWorkspace, request.Query, request.Timespan)
	}
	return result, err
}
