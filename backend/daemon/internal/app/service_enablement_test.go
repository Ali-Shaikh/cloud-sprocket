// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"slices"
	"testing"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

func TestWorkspaceTabsFilterDisabledServices(t *testing.T) {
	tabs := workspaceTabsForPreferences("aws", models.ServicePreferences{
		DisabledServices: map[string][]string{
			"aws": {"ecs", "secrets"},
		},
	})
	ids := workspaceTabIDs(tabs)
	if slices.Contains(ids, "ecs") || slices.Contains(ids, "secrets") {
		t.Fatalf("disabled services still present: %v", ids)
	}
	if !slices.Contains(ids, "s3") || !slices.Contains(ids, "overview") {
		t.Fatalf("expected shell and enabled services: %v", ids)
	}
}

func TestDisabledProviderBlocksServiceEnablement(t *testing.T) {
	service := &Service{
		preferences: models.ServicePreferences{
			DisabledProviders: []string{"aws"},
		},
	}
	if service.isServiceEnabled("aws", "s3") {
		t.Fatal("expected aws services disabled when provider is disabled")
	}
}

func TestAwsScopedEnrichmentSkipsDisabledService(t *testing.T) {
	service, _, ec2, _ := awsTestService(t)
	service.preferences = models.ServicePreferences{
		DisabledServices: map[string][]string{
			"aws": {"ec2"},
		},
	}

	snapshot := discovery.Snapshot{
		Providers: []models.ProviderSummary{{ProviderID: "aws", Label: "AWS"}},
		Profiles:  []models.ProfileSummary{{ProviderID: "aws", ProfileID: "sandbox", DisplayName: "sandbox"}},
	}
	session := models.SessionSnapshot{
		CurrentProviderID: "aws",
		SelectedProfileID: "sandbox",
		SelectedEC2Region: "us-east-1",
		IsLocked:          true,
	}

	_ = service.buildWorkspaceSnapshotOpts(snapshot, session, workspaceSnapshotOptions{
		awsScope:           "ec2",
		skipAzureInventory: true,
	})

	if ec2.listRegions.Load() != 0 || ec2.listInstances.Load() != 0 {
		t.Fatalf("expected EC2 enricher to be skipped, regions=%d instances=%d",
			ec2.listRegions.Load(), ec2.listInstances.Load())
	}
}