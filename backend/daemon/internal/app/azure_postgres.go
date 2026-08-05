// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"fmt"
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
