// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

//go:build liveazure

package azureadapter

import (
	"context"
	"os"
	"runtime"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

// Run with: go test -tags=liveazure ./internal/azureadapter/ -run TestLiveListStorageAccounts -v -count=1
func TestLiveListStorageAccounts(t *testing.T) {
	sub := os.Getenv("AZURE_SUBSCRIPTION_ID")
	if sub == "" {
		sub = "24abc62c-bba8-4e78-81f2-a2342790bfff"
	}
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}
	settings := config.FromEnv(map[string]string{}, runtime.GOOS, home)
	inv := NewInventory(settings)
	profile := models.ProfileSummary{
		ProviderID:  "azure",
		ProfileID:   sub,
		DisplayName: "live",
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	accounts, err := inv.ListStorageAccounts(ctx, profile)
	if err != nil {
		t.Fatalf("ListStorageAccounts: %v", err)
	}
	t.Logf("count=%d", len(accounts))
	for _, a := range accounts {
		t.Logf("account name=%s kind=%s loc=%s blob=%s", a.Name, a.Kind, a.Location, a.BlobEndpoint)
	}
	if len(accounts) == 0 {
		t.Fatal("expected at least one storage account from live Azure")
	}
}
