// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package store

import (
	"context"
	"path/filepath"
	"testing"

	"cloudsprocket/backend/daemon/internal/models"
)

func TestReplaceInventoryListsFiltersAndMarksMissingResourcesStale(t *testing.T) {
	dataStore, err := Open(filepath.Join(t.TempDir(), "inventory.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer dataStore.Close()

	ctx := context.Background()
	firstRun := inventoryTestRun("run-1", "2026-06-22T06:00:00Z")
	firstResources := []models.ResourceRecord{
		inventoryTestResource("aws://scope/eu-west-1/ec2/instance/i-1", "web-1", "ec2", "running", firstRun),
		inventoryTestResource("aws://scope/global/s3/bucket/assets", "assets", "s3", "", firstRun),
	}
	firstResources[0].Tags = map[string]string{"owner": "platform"}
	firstEdges := []models.ResourceEdge{{
		ScopeID:     firstRun.ScopeID,
		SourceID:    firstResources[0].ID,
		TargetID:    firstResources[1].ID,
		Kind:        "uses",
		Confidence:  "exact",
		LastSeenAt:  firstRun.CompletedAt,
		InventoryID: firstRun.RunID,
	}}
	if err := dataStore.ReplaceInventory(ctx, firstRun, firstResources, firstEdges); err != nil {
		t.Fatalf("replace first inventory: %v", err)
	}

	page, err := dataStore.ListResources(ctx, models.ResourceListFilter{ScopeID: firstRun.ScopeID, Limit: 1})
	if err != nil {
		t.Fatalf("list first page: %v", err)
	}
	if page.Total != 2 || len(page.Resources) != 1 || page.NextOffset == nil || *page.NextOffset != 1 {
		t.Fatalf("unexpected first page: %+v", page)
	}

	filtered, err := dataStore.ListResources(ctx, models.ResourceListFilter{Query: "platform"})
	if err != nil {
		t.Fatalf("query resources: %v", err)
	}
	if filtered.Total != 1 || filtered.Resources[0].Name != "web-1" {
		t.Fatalf("expected tag query to find web-1, got %+v", filtered)
	}

	secondRun := inventoryTestRun("run-2", "2026-06-22T06:05:00Z")
	updated := inventoryTestResource(firstResources[0].ID, "web-1", "ec2", "stopped", secondRun)
	if err := dataStore.ReplaceInventory(ctx, secondRun, []models.ResourceRecord{updated}, nil); err != nil {
		t.Fatalf("replace second inventory: %v", err)
	}

	current, err := dataStore.ListResources(ctx, models.ResourceListFilter{ScopeID: secondRun.ScopeID})
	if err != nil {
		t.Fatalf("list current resources: %v", err)
	}
	if current.Total != 1 || current.Resources[0].Status != "stopped" || current.Resources[0].Stale {
		t.Fatalf("expected one updated current resource, got %+v", current)
	}

	withStale, err := dataStore.ListResources(ctx, models.ResourceListFilter{
		ScopeID:      secondRun.ScopeID,
		IncludeStale: true,
	})
	if err != nil {
		t.Fatalf("list stale resources: %v", err)
	}
	if withStale.Total != 2 || !withStale.Resources[0].Stale && !withStale.Resources[1].Stale {
		t.Fatalf("expected missing resource to be retained as stale, got %+v", withStale)
	}

	resource, ok, err := dataStore.GetResource(ctx, secondRun.ScopeID, updated.ID)
	if err != nil || !ok || resource.Status != "stopped" {
		t.Fatalf("get updated resource: ok=%v resource=%+v err=%v", ok, resource, err)
	}

	runs, err := dataStore.ListLatestInventoryRuns(ctx)
	if err != nil {
		t.Fatalf("list latest runs: %v", err)
	}
	if len(runs) != 1 || runs[0].RunID != secondRun.RunID || runs[0].ResourceCount != 1 {
		t.Fatalf("expected latest run with persisted counts, got %+v", runs)
	}
}

func TestResetAppDataClearsInventoryIndex(t *testing.T) {
	dataStore, err := Open(filepath.Join(t.TempDir(), "inventory-reset.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer dataStore.Close()

	ctx := context.Background()
	run := inventoryTestRun("run-reset", "2026-06-22T06:00:00Z")
	if err := dataStore.ReplaceInventory(ctx, run, []models.ResourceRecord{
		inventoryTestResource("aws://resource", "resource", "s3", "", run),
	}, nil); err != nil {
		t.Fatalf("replace inventory: %v", err)
	}
	if err := dataStore.ResetAppData(ctx); err != nil {
		t.Fatalf("reset app data: %v", err)
	}
	resources, err := dataStore.ListResources(ctx, models.ResourceListFilter{IncludeStale: true})
	if err != nil || resources.Total != 0 {
		t.Fatalf("expected resources cleared, result=%+v err=%v", resources, err)
	}
	runs, err := dataStore.ListLatestInventoryRuns(ctx)
	if err != nil || len(runs) != 0 {
		t.Fatalf("expected inventory runs cleared, runs=%+v err=%v", runs, err)
	}
}

func inventoryTestRun(id string, timestamp string) models.InventoryRun {
	return models.InventoryRun{
		RunID:       id,
		ScopeID:     "aws:sandbox",
		Provider:    "aws",
		ProfileID:   "sandbox",
		StartedAt:   timestamp,
		CompletedAt: timestamp,
		Status:      "completed",
	}
}

func inventoryTestResource(id string, name string, service string, status string, run models.InventoryRun) models.ResourceRecord {
	return models.ResourceRecord{
		ID:          id,
		ScopeID:     run.ScopeID,
		Provider:    run.Provider,
		AccountID:   run.ProfileID,
		Service:     service,
		Type:        "resource",
		Name:        name,
		Status:      status,
		LastSeenAt:  run.CompletedAt,
		InventoryID: run.RunID,
	}
}
