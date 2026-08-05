// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"fmt"
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
