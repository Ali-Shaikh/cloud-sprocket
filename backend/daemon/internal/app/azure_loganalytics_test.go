// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"testing"

	"cloudsprocket/backend/daemon/internal/models"
)

func TestAzureLogAnalyticsQueryWorkspaceUsesCustomerID(t *testing.T) {
	workspaces := []models.AzureLogAnalyticsWorkspace{
		{Name: "erw-prod-afd-law", CustomerID: "11111111-2222-3333-4444-555555555555"},
	}

	got, err := azureLogAnalyticsQueryWorkspace("erw-prod-afd-law", workspaces, true)
	if err != nil || got != workspaces[0].CustomerID {
		t.Fatalf("query workspace = %q (err %v), want customer ID %q", got, err, workspaces[0].CustomerID)
	}
	got, err = azureLogAnalyticsQueryWorkspace(workspaces[0].CustomerID, workspaces, true)
	if err != nil || got != workspaces[0].CustomerID {
		t.Fatalf("query workspace = %q (err %v), want existing customer ID", got, err)
	}
}

func TestAzureLogAnalyticsQueryWorkspaceCloudRejectsBareName(t *testing.T) {
	workspaces := []models.AzureLogAnalyticsWorkspace{
		{Name: "law-no-guid", CustomerID: ""},
	}

	// Matched by name but no GUID available: cloud must error rather than pass
	// the name to `az -w`, which only accepts the GUID.
	if _, err := azureLogAnalyticsQueryWorkspace("law-no-guid", workspaces, true); err == nil {
		t.Fatal("expected an error for a matched workspace without a customer ID on cloud")
	}
	// Unknown bare name on cloud is rejected too.
	if _, err := azureLogAnalyticsQueryWorkspace("not-in-list", workspaces, true); err == nil {
		t.Fatal("expected an error for an unresolved bare name on cloud")
	}
	// A directly typed GUID is accepted even if it is not in the loaded list.
	guid := "22222222-3333-4444-5555-666666666666"
	if got, err := azureLogAnalyticsQueryWorkspace(guid, workspaces, true); err != nil || got != guid {
		t.Fatalf("typed GUID = %q (err %v), want %q", got, err, guid)
	}
	// Local floci keeps the relaxed behaviour: a bare name passes through.
	if got, err := azureLogAnalyticsQueryWorkspace("law-no-guid", workspaces, false); err != nil || got != "law-no-guid" {
		t.Fatalf("local workspace = %q (err %v), want name passthrough", got, err)
	}
}
