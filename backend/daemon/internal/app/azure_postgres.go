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

func (s *Service) azurePostgresServers(ctx context.Context, profile models.ProfileSummary) []models.AzurePostgresServer {
	const scope = "azure.postgres-servers"
	servers, err := s.azure.ListPostgresServers(ctx, profile)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, profile.ProfileID, servers, s.timestamp())
		return servers
	}
	var cached []models.AzurePostgresServer
	if _, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, profile.ProfileID, &cached); cacheErr == nil && ok {
		return cached
	}
	return []models.AzurePostgresServer{}
}

func (s *Service) azurePostgresConnection(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	serverName string,
) *models.AzurePostgresConnection {
	if serverName == "" {
		return nil
	}
	conn, err := s.azure.GetPostgresConnection(ctx, profile, resourceGroup, serverName)
	if err != nil {
		return nil
	}
	if conn.Host != "" && conn.Port > 0 {
		return &conn
	}
	return nil
}

func postgresServerNames(servers []models.AzurePostgresServer) []string {
	names := make([]string, 0, len(servers))
	for _, server := range servers {
		names = append(names, server.Name)
	}
	return names
}

func resourceGroupForPostgresServer(servers []models.AzurePostgresServer, name string) string {
	for _, server := range servers {
		if server.Name == name {
			return server.ResourceGroup
		}
	}
	return ""
}

func (s *Service) enrichAzurePostgresInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts azureEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "azure" ||
		workspace.Profile == nil ||
		s.azure == nil {
		return
	}
	ctx, cancel := s.withAzureTimeout(context.Background())
	defer cancel()
	profile := *workspace.Profile

	servers := s.azurePostgresServers(ctx, profile)
	server := selectedName(session.SelectedAzurePostgresServer, postgresServerNames(servers))
	rg := resourceGroupForPostgresServer(servers, server)

	var (
		connection *models.AzurePostgresConnection
		status     string
	)

	if len(servers) == 0 {
		status = "No PostgreSQL flexible servers found."
	} else {
		status = fmt.Sprintf("Loaded %d PostgreSQL server(s).", len(servers))
	}

	if !opts.lightweight && server != "" {
		connection = s.azurePostgresConnection(ctx, profile, rg, server)
		if connection != nil && connection.Host != "" {
			for index := range servers {
				if servers[index].Name == server {
					servers[index].LocalHost = connection.Host
					servers[index].LocalPort = connection.Port
					break
				}
			}
		}
	}

	lockWorkspace(mu, func() {
		workspace.AzurePostgresServers = servers
		workspace.SelectedAzurePostgresServer = server
		workspace.AzurePostgresConnection = connection
		workspace.AzurePostgresStatusMessage = status
	})
}

func (s *Service) handleAzurePostgresSelectServer(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Server string `json:"server"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a PostgreSQL server", func(session *models.SessionSnapshot) error {
		session.SelectedAzurePostgresServer = request.Server
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		skipAwsInventory: true,
		azureScope:       "postgres",
	}, "", "")
}

func (s *Service) handleAzurePostgresStartServer(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	return s.handleAzurePostgresLifecycle(ctx, params, notifier, "start")
}

func (s *Service) handleAzurePostgresStopServer(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	return s.handleAzurePostgresLifecycle(ctx, params, notifier, "stop")
}

func (s *Service) handleAzurePostgresLifecycle(
	ctx context.Context,
	params json.RawMessage,
	notifier Notifier,
	action string,
) (any, error) {
	var request struct {
		Server        string `json:"server"`
		ResourceGroup string `json:"resourceGroup"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	serverName := strings.TrimSpace(request.Server)
	resourceGroup := strings.TrimSpace(request.ResourceGroup)
	if serverName == "" {
		return nil, errors.New("a server name is required")
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
		return nil, errors.New("open a locked Azure workspace before managing a PostgreSQL server")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		s.mu.Unlock()
		return nil, errors.New("the workspace's Azure profile is not available")
	}
	if !effectiveAzureWritesEnabled(session, profile, s.azureProviderCommandPath(snapshot)) {
		s.mu.Unlock()
		return nil, errors.New("PostgreSQL server actions require write mode to be enabled for this Azure workspace")
	}
	selectedServer := session.SelectedAzurePostgresServer
	s.mu.Unlock()

	if resourceGroup == "" {
		servers := s.azurePostgresServers(ctx, profile)
		resourceGroup = resourceGroupForPostgresServer(servers, serverName)
		if resourceGroup == "" {
			resourceGroup = resourceGroupForPostgresServer(servers, selectedServer)
		}
	}
	if resourceGroup == "" {
		return nil, errors.New("a resource group is required")
	}

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	var result models.AzurePostgresLifecycleResult
	var actionErr error
	switch action {
	case "start":
		result, actionErr = s.azure.StartPostgresServer(timeoutCtx, profile, resourceGroup, serverName)
	case "stop":
		result, actionErr = s.azure.StopPostgresServer(timeoutCtx, profile, resourceGroup, serverName)
	default:
		cancel()
		return nil, fmt.Errorf("unsupported postgres server action %q", action)
	}
	cancel()
	if actionErr != nil {
		return nil, actionErr
	}

	s.invalidateResourceCache(ctx, "azure.postgres-servers", profile.ProfileID)

	s.mu.Lock()
	session, err = s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	session.SelectedAzurePostgresServer = serverName
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	s.mu.Unlock()
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		skipAwsInventory: true,
		azureScope:       "postgres",
	}, "success", result.Summary)
}