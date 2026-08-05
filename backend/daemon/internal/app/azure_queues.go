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

func (s *Service) azureStorageQueues(ctx context.Context, profile models.ProfileSummary, account string) []models.AzureStorageQueue {
	if account == "" {
		return []models.AzureStorageQueue{}
	}
	const scope = "azure.storage-queues"
	hash := profile.ProfileID + "|" + account
	queues, err := s.azure.ListStorageQueues(ctx, profile, account)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, hash, queues, s.timestamp())
		return queues
	}
	var cached []models.AzureStorageQueue
	if _, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, hash, &cached); cacheErr == nil && ok {
		return cached
	}
	return []models.AzureStorageQueue{}
}

func (s *Service) enrichAzureQueuesInventory(
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

	account := s.selectedAzureStorageAccount(session, workspace.AzureStorageAccounts)
	queues := s.azureStorageQueues(ctx, profile, account)
	names := make([]string, 0, len(queues))
	for _, queue := range queues {
		names = append(names, queue.Name)
	}
	queue := selectedName(session.SelectedAzureQueue, names)

	var messages []models.AzureQueueMessage
	if !opts.lightweight && queue != "" {
		if peeked, err := s.azure.PeekQueueMessages(ctx, profile, account, queue); err == nil {
			messages = peeked
		}
	}

	var status string
	switch {
	case account == "":
		status = "Select a storage account to browse queues."
	case len(queues) == 0:
		status = fmt.Sprintf("No queues found in %s.", account)
	default:
		status = fmt.Sprintf("Loaded %d queue(s) from %s.", len(queues), account)
	}

	lockWorkspace(mu, func() {
		workspace.AzureStorageQueues = queues
		workspace.SelectedAzureQueue = queue
		workspace.AzureQueueMessages = messages
		workspace.AzureQueuesStatusMessage = status
	})
}

func (s *Service) handleAzureQueuesPurge(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Account string `json:"account"`
		Queue   string `json:"queue"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	accountName := strings.TrimSpace(request.Account)
	queueName := strings.TrimSpace(request.Queue)

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
		return nil, errors.New("open a locked Azure workspace before purging a queue")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		s.mu.Unlock()
		return nil, errors.New("the workspace's Azure profile is not available")
	}
	if !effectiveAzureWritesEnabled(session, profile, s.azureProviderCommandPath(snapshot)) {
		s.mu.Unlock()
		return nil, errors.New("queue purge requires write mode to be enabled for this Azure workspace")
	}
	if accountName == "" {
		accountName = session.SelectedAzureStorageAccount
	}
	if queueName == "" {
		queueName = session.SelectedAzureQueue
	}
	s.mu.Unlock()

	if accountName == "" {
		return nil, errors.New("select a storage account before purging a queue")
	}
	if queueName == "" {
		return nil, errors.New("select a queue before purging messages")
	}

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	result, actionErr := s.azure.PurgeQueueMessages(timeoutCtx, profile, accountName, queueName)
	cancel()
	if actionErr != nil {
		return nil, actionErr
	}

	s.invalidateResourceCache(ctx, "azure.storage-queues", profile.ProfileID+"|"+accountName)

	s.mu.Lock()
	session, err = s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	session.SelectedAzureStorageAccount = accountName
	session.SelectedAzureQueue = queueName
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	s.mu.Unlock()
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		skipAwsInventory: true,
		azureScope:       "queues",
	}, "success", result.Summary)
}

