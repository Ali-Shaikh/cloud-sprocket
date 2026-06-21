package app

import (
	"context"
	"encoding/json"
	"fmt"

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

func (s *Service) enrichAzureQueuesInventory(workspace *models.WorkspaceSnapshot, session models.SessionSnapshot) {
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

	workspace.AzureStorageQueues = queues
	workspace.SelectedAzureQueue = queue
	if queue != "" {
		if messages, err := s.azure.PeekQueueMessages(ctx, profile, account, queue); err == nil {
			workspace.AzureQueueMessages = messages
		} else {
			workspace.AzureQueueMessages = []models.AzureQueueMessage{}
		}
	} else {
		workspace.AzureQueueMessages = []models.AzureQueueMessage{}
	}

	if account == "" {
		workspace.AzureQueuesStatusMessage = "Select a storage account to browse queues."
		return
	}
	if len(queues) == 0 {
		workspace.AzureQueuesStatusMessage = fmt.Sprintf("No queues found in %s.", account)
		return
	}
	workspace.AzureQueuesStatusMessage = fmt.Sprintf("Loaded %d queue(s) from %s.", len(queues), account)
}

func (s *Service) handleAzureQueuesSelectQueue(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Queue string `json:"queue"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a queue", func(session *models.SessionSnapshot) error {
		session.SelectedAzureQueue = request.Queue
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureWorkspace(ctx, snapshot, session, notifier, "", "")
}
