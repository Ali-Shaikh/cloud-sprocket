// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
)

func TestNormaliseQueueMessage(t *testing.T) {
	if _, err := NormaliseQueueMessage("  "); err == nil {
		t.Fatal("expected empty message error")
	}
	got, err := NormaliseQueueMessage("  hello queue  ")
	if err != nil || got != "hello queue" {
		t.Fatalf("got %q err %v", got, err)
	}
	tooLong := strings.Repeat("x", azureQueueMessageMaxBytes+1)
	if _, err := NormaliseQueueMessage(tooLong); err == nil {
		t.Fatal("expected oversized message error")
	}
}

func TestSendQueueMessageRequiresNames(t *testing.T) {
	inv := NewInventory(config.Settings{})
	if _, err := inv.SendQueueMessage(context.Background(), cloudAzureProfile(), "", "jobs", "hello"); err == nil {
		t.Fatal("expected storage account required")
	}
	if _, err := inv.SendQueueMessage(context.Background(), cloudAzureProfile(), "acct", "", "hello"); err == nil {
		t.Fatal("expected queue name required")
	}
	if _, err := inv.SendQueueMessage(context.Background(), cloudAzureProfile(), "acct", "jobs", "  "); err == nil {
		t.Fatal("expected message text required")
	}
}

func TestPurgeQueueMessagesRequiresNames(t *testing.T) {
	inv := NewInventory(config.Settings{})
	if _, err := inv.PurgeQueueMessages(context.Background(), cloudAzureProfile(), "", "jobs"); err == nil {
		t.Fatal("expected storage account required")
	}
	if _, err := inv.PurgeQueueMessages(context.Background(), cloudAzureProfile(), "acct", ""); err == nil {
		t.Fatal("expected queue name required")
	}
}
