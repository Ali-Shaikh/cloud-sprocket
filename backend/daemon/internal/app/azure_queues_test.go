// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"testing"

	"cloudsprocket/backend/daemon/internal/models"
)

type fakeQueuePurgeInventory struct {
	stubAzureInventory
	purged  bool
	account string
	queue   string
}

func (f *fakeQueuePurgeInventory) PurgeQueueMessages(_ context.Context, _ models.ProfileSummary, accountName string, queueName string) (models.AzureQueuePurgeResult, error) {
	f.purged = true
	f.account = accountName
	f.queue = queueName
	return models.AzureQueuePurgeResult{
		AccountName: accountName,
		QueueName:   queueName,
		Summary:     "Purged all messages from queue " + queueName + " in " + accountName + ".",
	}, nil
}

func TestAzurePurgeQueueMessagesInventory(t *testing.T) {
	azure := &fakeQueuePurgeInventory{}
	result, err := azure.PurgeQueueMessages(context.Background(), models.ProfileSummary{}, "devstoreaccount1", "jobs")
	if err != nil {
		t.Fatal(err)
	}
	if !azure.purged || azure.account != "devstoreaccount1" || azure.queue != "jobs" {
		t.Fatalf("purge call = %+v", azure)
	}
	if result.Summary == "" {
		t.Fatal("expected summary")
	}
}
