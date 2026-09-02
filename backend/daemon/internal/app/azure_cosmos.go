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

func (s *Service) azureCosmosAccounts(ctx context.Context, profile models.ProfileSummary) []models.AzureCosmosAccount {
	accounts, _ := s.azureCosmosAccountsResult(ctx, profile)
	return accounts
}

func (s *Service) azureCosmosAccountsResult(ctx context.Context, profile models.ProfileSummary) ([]models.AzureCosmosAccount, error) {
	const scope = "azure.cosmos-accounts"
	accounts, err := s.azure.ListCosmosAccounts(ctx, profile)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, profile.ProfileID, accounts, s.timestamp())
		return accounts, nil
	}
	var cached []models.AzureCosmosAccount
	if _, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, profile.ProfileID, &cached); cacheErr == nil && ok {
		return cached, nil
	}
	return []models.AzureCosmosAccount{}, err
}

func (s *Service) azureCosmosDatabases(ctx context.Context, profile models.ProfileSummary, account, rg string) []models.AzureCosmosDatabase {
	if account == "" {
		return []models.AzureCosmosDatabase{}
	}
	const scope = "azure.cosmos-databases"
	hash := profile.ProfileID + "|" + account
	databases, err := s.azure.ListCosmosDatabases(ctx, profile, account, rg)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, hash, databases, s.timestamp())
		return databases
	}
	var cached []models.AzureCosmosDatabase
	if _, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, hash, &cached); cacheErr == nil && ok {
		return cached
	}
	return []models.AzureCosmosDatabase{}
}

func (s *Service) azureCosmosContainers(ctx context.Context, profile models.ProfileSummary, account, rg, database string) []models.AzureCosmosContainer {
	if account == "" || database == "" {
		return []models.AzureCosmosContainer{}
	}
	const scope = "azure.cosmos-containers"
	hash := profile.ProfileID + "|" + account + "|" + database
	containers, err := s.azure.ListCosmosContainers(ctx, profile, account, rg, database)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, hash, containers, s.timestamp())
		return containers
	}
	var cached []models.AzureCosmosContainer
	if _, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, hash, &cached); cacheErr == nil && ok {
		return cached
	}
	return []models.AzureCosmosContainer{}
}

func (s *Service) azureCosmosItems(ctx context.Context, profile models.ProfileSummary, account, rg, database, container string) []models.AzureCosmosItem {
	if account == "" || database == "" || container == "" {
		return []models.AzureCosmosItem{}
	}
	items, err := s.azure.ListCosmosItems(ctx, profile, account, rg, database, container)
	if err != nil {
		return []models.AzureCosmosItem{}
	}
	return items
}

func selectedName(selected string, names []string) string {
	for _, name := range names {
		if name == selected {
			return selected
		}
	}
	if len(names) == 0 {
		return ""
	}
	return names[0]
}

func cosmosAccountNames(accounts []models.AzureCosmosAccount) []string {
	names := make([]string, 0, len(accounts))
	for _, account := range accounts {
		names = append(names, account.Name)
	}
	return names
}

func resourceGroupForCosmosAccount(accounts []models.AzureCosmosAccount, name string) string {
	for _, account := range accounts {
		if account.Name == name {
			return account.ResourceGroup
		}
	}
	return ""
}

func (s *Service) enrichAzureCosmosInventory(
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

	accounts, listErr := s.azureCosmosAccountsResult(ctx, profile)
	account := selectedName(session.SelectedAzureCosmosAccount, cosmosAccountNames(accounts))
	rg := resourceGroupForCosmosAccount(accounts, account)

	var (
		databases  []models.AzureCosmosDatabase
		database   string
		containers []models.AzureCosmosContainer
		container  string
		items      []models.AzureCosmosItem
		status     string
	)

	if opts.lightweight {
		if len(accounts) == 0 {
			status = "No Cosmos DB accounts found."
		} else {
			status = fmt.Sprintf("Loaded %d Cosmos account(s).", len(accounts))
		}
		lockWorkspace(mu, func() {
			workspace.AzureCosmosAccounts = accounts
			workspace.SelectedAzureCosmosAccount = account
			workspace.AzureCosmosDatabases = []models.AzureCosmosDatabase{}
			workspace.SelectedAzureCosmosDatabase = ""
			workspace.AzureCosmosContainers = []models.AzureCosmosContainer{}
			workspace.SelectedAzureCosmosContainer = ""
			workspace.AzureCosmosItems = []models.AzureCosmosItem{}
			workspace.AzureCosmosStatusMessage = status
			markAzureInventory(workspace, "cosmos", len(accounts), azureInventoryListEmptyReason(len(accounts), listErr))
		})
		return
	}

	databases = s.azureCosmosDatabases(ctx, profile, account, rg)
	dbNames := make([]string, 0, len(databases))
	for _, db := range databases {
		dbNames = append(dbNames, db.Name)
	}
	database = selectedName(session.SelectedAzureCosmosDatabase, dbNames)

	containers = s.azureCosmosContainers(ctx, profile, account, rg, database)
	containerNames := make([]string, 0, len(containers))
	for _, c := range containers {
		containerNames = append(containerNames, c.Name)
	}
	container = selectedName(session.SelectedAzureCosmosContainer, containerNames)
	items = s.azureCosmosItems(ctx, profile, account, rg, database, container)

	if len(accounts) == 0 {
		status = "No Cosmos DB accounts found."
	} else {
		status = fmt.Sprintf("Loaded %d Cosmos account(s).", len(accounts))
	}
	lockWorkspace(mu, func() {
		workspace.AzureCosmosAccounts = accounts
		workspace.SelectedAzureCosmosAccount = account
		workspace.AzureCosmosDatabases = databases
		workspace.SelectedAzureCosmosDatabase = database
		workspace.AzureCosmosContainers = containers
		workspace.SelectedAzureCosmosContainer = container
		workspace.AzureCosmosItems = items
		workspace.AzureCosmosStatusMessage = status
		markAzureInventory(workspace, "cosmos", len(accounts), azureInventoryListEmptyReason(len(accounts), listErr))
	})
}

func (s *Service) handleAzureCosmosQuery(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
	if s.azure == nil {
		return nil, errors.New("azure inventory is not available")
	}
	var request struct {
		Account       string `json:"account"`
		Database      string `json:"database"`
		Container     string `json:"container"`
		Query         string `json:"query"`
		ResourceGroup string `json:"resourceGroup"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
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
		return nil, errors.New("open a locked Azure workspace before running a Cosmos query")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		s.mu.Unlock()
		return nil, errors.New("the workspace's Azure profile is not available")
	}
	s.mu.Unlock()

	account := strings.TrimSpace(request.Account)
	if account == "" {
		account = session.SelectedAzureCosmosAccount
	}
	database := strings.TrimSpace(request.Database)
	if database == "" {
		database = session.SelectedAzureCosmosDatabase
	}
	container := strings.TrimSpace(request.Container)
	if container == "" {
		container = session.SelectedAzureCosmosContainer
	}
	resourceGroup := strings.TrimSpace(request.ResourceGroup)
	queryCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	if resourceGroup == "" {
		accounts := s.azureCosmosAccounts(queryCtx, profile)
		resourceGroup = resourceGroupForCosmosAccount(accounts, account)
	}
	return s.azure.QueryCosmosItems(queryCtx, profile, account, resourceGroup, database, container, request.Query)
}
