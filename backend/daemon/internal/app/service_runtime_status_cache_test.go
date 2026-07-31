// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

type countingAzureCLIExtensions struct {
	stubAzureInventory
	checks int
}

func (a *countingAzureCLIExtensions) CheckCLIExtensions(context.Context) []models.AzureCLIExtensionStatus {
	a.checks++
	return []models.AzureCLIExtensionStatus{
		{Name: "account", Installed: true, Summary: "installed"},
	}
}

func TestAzureCLIExtensionChecksCachePerProfile(t *testing.T) {
	azure := &countingAzureCLIExtensions{}
	clock := time.Now()
	s := &Service{
		azure: azure,
		now:   func() time.Time { return clock },
	}
	snapshot := discovery.Snapshot{
		Providers: []models.ProviderSummary{
			{ProviderID: "azure", CommandPath: `C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd`},
		},
	}
	profileA := models.ProfileSummary{ProfileID: "sub-a", ProviderID: "azure", DisplayName: "A"}
	profileB := models.ProfileSummary{ProfileID: "sub-b", ProviderID: "azure", DisplayName: "B"}

	first := s.azureCLIExtensionChecks(snapshot, profileA)
	if len(first) != 1 || azure.checks != 1 {
		t.Fatalf("expected one CLI check, checks=%d statuses=%d", azure.checks, len(first))
	}
	_ = s.azureCLIExtensionChecks(snapshot, profileA)
	if azure.checks != 1 {
		t.Fatalf("expected same-profile TTL hit, checks=%d", azure.checks)
	}

	_ = s.azureCLIExtensionChecks(snapshot, profileB)
	if azure.checks != 2 {
		t.Fatalf("expected different profile to re-check, checks=%d", azure.checks)
	}

	s.invalidateAzureCLIExtensionCache()
	_ = s.azureCLIExtensionChecks(snapshot, profileB)
	if azure.checks != 3 {
		t.Fatalf("expected explicit invalidation to re-check, checks=%d", azure.checks)
	}

	clock = clock.Add(azureCLIExtensionCacheTTL + time.Second)
	_ = s.azureCLIExtensionChecks(snapshot, profileB)
	if azure.checks != 4 {
		t.Fatalf("expected TTL expiry to re-check, checks=%d", azure.checks)
	}
}

func TestAzureCLIExtensionChecksSkipsEmptyProfileCache(t *testing.T) {
	azure := &countingAzureCLIExtensions{}
	clock := time.Now()
	s := &Service{
		azure: azure,
		now:   func() time.Time { return clock },
	}
	snapshot := discovery.Snapshot{
		Providers: []models.ProviderSummary{
			{ProviderID: "azure", CommandPath: `C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd`},
		},
	}
	valid := models.ProfileSummary{ProfileID: "sub-a", ProviderID: "azure", DisplayName: "A"}
	empty := models.ProfileSummary{ProfileID: "", ProviderID: "azure", DisplayName: "blank"}

	_ = s.azureCLIExtensionChecks(snapshot, valid)
	if azure.checks != 1 {
		t.Fatalf("expected first check, got %d", azure.checks)
	}
	_ = s.azureCLIExtensionChecks(snapshot, empty)
	if azure.checks != 2 {
		t.Fatalf("expected empty profile to always probe, got %d", azure.checks)
	}
	_ = s.azureCLIExtensionChecks(snapshot, valid)
	if azure.checks != 2 {
		t.Fatalf("empty profile must not poison valid profile cache, checks=%d", azure.checks)
	}
}
