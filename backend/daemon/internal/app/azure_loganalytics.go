package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

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

func (s *Service) enrichAzureLogAnalyticsInventory(workspace *models.WorkspaceSnapshot, session models.SessionSnapshot) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "azure" ||
		workspace.Profile == nil ||
		s.azure == nil {
		return
	}
	ctx, cancel := s.withAzureTimeout(context.Background())
	defer cancel()
	workspace.AzureLogAnalyticsWorkspaces = s.azureLogAnalyticsWorkspaces(ctx, *workspace.Profile)
	workspace.SelectedAzureLogWorkspace = s.selectedAzureLogWorkspace(session, workspace.AzureLogAnalyticsWorkspaces)
	if len(workspace.AzureLogAnalyticsWorkspaces) == 0 {
		workspace.AzureLogAnalyticsStatusMessage =
			"No Log Analytics workspaces found. Create one, then run KQL queries here."
		return
	}
	workspace.AzureLogAnalyticsStatusMessage = fmt.Sprintf(
		"Loaded %d Log Analytics workspace(s). Local KQL is a subset of Azure KQL.",
		len(workspace.AzureLogAnalyticsWorkspaces),
	)
}

func (s *Service) handleAzureLogAnalyticsSelectWorkspace(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Workspace string `json:"workspace"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a Log Analytics workspace", func(session *models.SessionSnapshot) error {
		session.SelectedAzureLogWorkspace = strings.TrimSpace(request.Workspace)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureWorkspace(ctx, snapshot, session, notifier, "", "")
}

func (s *Service) handleAzureLogAnalyticsQuery(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
	var request struct {
		Workspace string `json:"workspace"`
		Query     string `json:"query"`
		Timespan  string `json:"timespan"`
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

	workspace := strings.TrimSpace(request.Workspace)
	if workspace == "" {
		workspace = s.selectedAzureLogWorkspace(session, s.azureLogAnalyticsWorkspaces(ctx, profile))
	}
	if workspace == "" {
		return nil, errors.New("select a Log Analytics workspace before running a query")
	}

	// The adapter bounds the query itself; do not also wrap in the shorter inventory timeout.
	return s.azure.RunLogAnalyticsQuery(ctx, profile, workspace, request.Query, request.Timespan)
}
