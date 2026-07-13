// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/Azure/azure-sdk-for-go/sdk/storage/azqueue/v2"

	"cloudsprocket/backend/daemon/internal/models"
)

const queuePeekCount = 10

// queueServiceClient builds an azqueue service client for a storage account,
// pointing at floci-az locally or real Azure storage in the cloud (mirrors the
// blob client). Shared-key auth signs the data-plane requests.
func (i *Inventory) queueServiceClient(
	ctx context.Context,
	profile models.ProfileSummary,
	accountName string,
) (*azqueue.ServiceClient, error) {
	accountKey, err := i.storageAccountKey(ctx, profile, accountName)
	if err != nil {
		return nil, err
	}
	credential, err := azqueue.NewSharedKeyCredential(accountName, accountKey)
	if err != nil {
		return nil, fmt.Errorf("azure queue credential: %w", err)
	}
	endpoint := fmt.Sprintf("https://%s.queue.core.windows.net", accountName)
	if isLocalFlociProfile(profile) {
		endpoint = i.flociEndpoint() + "/" + accountName + "-queue"
	}
	return azqueue.NewServiceClientWithSharedKeyCredential(endpoint, credential, nil)
}

// ListStorageQueues lists the queues in a storage account.
func (i *Inventory) ListStorageQueues(
	ctx context.Context,
	profile models.ProfileSummary,
	accountName string,
) ([]models.AzureStorageQueue, error) {
	accountName = strings.TrimSpace(accountName)
	if accountName == "" {
		return nil, fmt.Errorf("a storage account is required")
	}
	client, err := i.queueServiceClient(ctx, profile, accountName)
	if err != nil {
		return nil, err
	}
	queues := []models.AzureStorageQueue{}
	pager := client.NewListQueuesPager(nil)
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("list azure queues: %w", err)
		}
		for _, queue := range page.Queues {
			if queue == nil || queue.Name == nil {
				continue
			}
			queues = append(queues, models.AzureStorageQueue{Name: *queue.Name})
		}
	}
	sort.Slice(queues, func(left, right int) bool {
		return strings.ToLower(queues[left].Name) < strings.ToLower(queues[right].Name)
	})
	return queues, nil
}

// GetQueueApproximateMessageCount returns the queue approximate message count.
func (i *Inventory) GetQueueApproximateMessageCount(
	ctx context.Context,
	profile models.ProfileSummary,
	accountName string,
	queueName string,
) (int64, error) {
	accountName = strings.TrimSpace(accountName)
	queueName = strings.TrimSpace(queueName)
	if accountName == "" || queueName == "" {
		return 0, fmt.Errorf("a storage account and queue are required")
	}
	client, err := i.queueServiceClient(ctx, profile, accountName)
	if err != nil {
		return 0, err
	}
	queueClient := client.NewQueueClient(queueName)
	props, err := queueClient.GetProperties(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("get azure queue properties: %w", err)
	}
	if props.ApproximateMessagesCount == nil {
		return 0, nil
	}
	return int64(*props.ApproximateMessagesCount), nil
}

// PeekQueueMessages reads messages without consuming them (no side effects).
func (i *Inventory) PeekQueueMessages(
	ctx context.Context,
	profile models.ProfileSummary,
	accountName string,
	queueName string,
) ([]models.AzureQueueMessage, error) {
	accountName = strings.TrimSpace(accountName)
	queueName = strings.TrimSpace(queueName)
	if accountName == "" || queueName == "" {
		return nil, fmt.Errorf("a storage account and queue are required")
	}
	client, err := i.queueServiceClient(ctx, profile, accountName)
	if err != nil {
		return nil, err
	}
	queueClient := client.NewQueueClient(queueName)
	count := int32(queuePeekCount)
	response, err := queueClient.PeekMessages(ctx, &azqueue.PeekMessagesOptions{NumberOfMessages: &count})
	if err != nil {
		return nil, fmt.Errorf("peek azure queue messages: %w", err)
	}
	messages := make([]models.AzureQueueMessage, 0, len(response.Messages))
	for _, message := range response.Messages {
		if message == nil {
			continue
		}
		entry := models.AzureQueueMessage{}
		if message.MessageID != nil {
			entry.ID = *message.MessageID
		}
		if message.MessageText != nil {
			entry.Text = *message.MessageText
		}
		if message.DequeueCount != nil {
			entry.DequeueCount = *message.DequeueCount
		}
		if message.InsertionTime != nil {
			entry.InsertionTime = message.InsertionTime.Format("2006-01-02T15:04:05Z07:00")
		}
		messages = append(messages, entry)
	}
	return messages, nil
}
