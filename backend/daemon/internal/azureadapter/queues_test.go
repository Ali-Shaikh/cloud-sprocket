// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
)

func TestPurgeQueueMessagesRequiresNames(t *testing.T) {
	inv := NewInventory(config.Settings{})
	if _, err := inv.PurgeQueueMessages(context.Background(), cloudAzureProfile(), "", "jobs"); err == nil {
		t.Fatal("expected storage account required")
	}
	if _, err := inv.PurgeQueueMessages(context.Background(), cloudAzureProfile(), "acct", ""); err == nil {
		t.Fatal("expected queue name required")
	}
}
