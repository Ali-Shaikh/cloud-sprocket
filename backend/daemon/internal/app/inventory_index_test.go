// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
)

func TestNormaliseAWSWorkspaceInventoryExcludesSensitiveTags(t *testing.T) {
	workspace := models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "aws"},
		Profile: &models.ProfileSummary{
			ProfileID:  "sandbox",
			Attributes: []models.DetailField{{Label: "Sso Account Id", Value: "123456789012"}},
		},
		SelectedEC2Region: "eu-west-1",
		S3Buckets:         []models.AwsS3Bucket{{Name: "assets"}},
		EC2Instances: []models.AwsEc2Instance{{
			InstanceID: "i-123",
			Name:       "web",
			State:      "running",
			PublicIP:   "203.0.113.10",
			Tags: []models.DetailField{
				{Label: "owner", Value: "platform"},
				{Label: "token", Value: "redacted", Sensitive: true},
			},
		}},
	}

	run, resources, edges, ok := normaliseWorkspaceInventory(
		workspace,
		time.Date(2026, 6, 22, 6, 0, 0, 0, time.UTC),
	)
	if !ok || run.ScopeID != "aws:sandbox" || run.ResourceCount != 2 || len(edges) != 0 {
		t.Fatalf("unexpected normalisation result: run=%+v resources=%+v edges=%+v ok=%v", run, resources, edges, ok)
	}
	instance := findIndexedResource(resources, "ec2", "web")
	if instance == nil {
		t.Fatal("expected EC2 instance in index")
	}
	if instance.Tags["owner"] != "platform" {
		t.Fatalf("expected non-sensitive tag, got %+v", instance.Tags)
	}
	if _, exists := instance.Tags["token"]; exists {
		t.Fatalf("sensitive tag was indexed: %+v", instance.Tags)
	}
	if instance.Attributes["publicIp"] != "203.0.113.10" || instance.Region != "eu-west-1" {
		t.Fatalf("expected operational attributes, got %+v", instance)
	}
	if instance.AccountID != "123456789012" {
		t.Fatalf("expected AWS account metadata, got %q", instance.AccountID)
	}
}

func TestNormaliseAzureWorkspaceCreatesExactContainmentAndPlanEdges(t *testing.T) {
	workspace := models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "azure"},
		Profile:  &models.ProfileSummary{ProfileID: "sub-001"},
		AzureResourceGroups: []models.AzureResourceGroup{{
			Name: "apps-rg", Location: "westeurope", ProvisioningState: "Succeeded",
		}},
		AzureVirtualMachines: []models.AzureVirtualMachine{{
			VMID: "vm-guid", Name: "worker", ResourceGroup: "apps-rg", Location: "westeurope",
		}},
		AzureAppServicePlans: []models.AzureAppServicePlan{{
			Name: "apps-plan", ResourceGroup: "apps-rg", Location: "westeurope",
		}},
		AzureWebApps: []models.AzureWebApp{{
			Name: "api", ResourceGroup: "apps-rg", Location: "westeurope", AppServicePlan: "apps-plan",
		}},
	}

	run, resources, edges, ok := normaliseWorkspaceInventory(
		workspace,
		time.Date(2026, 6, 22, 6, 0, 0, 0, time.UTC),
	)
	if !ok || run.ResourceCount != 4 || run.EdgeCount != 4 {
		t.Fatalf("unexpected Azure normalisation: run=%+v resources=%+v edges=%+v", run, resources, edges)
	}
	contained := 0
	runsOn := 0
	for _, edge := range edges {
		if edge.Confidence != "exact" || edge.SourceID == "" || edge.TargetID == "" {
			t.Fatalf("expected evidenced edge, got %+v", edge)
		}
		switch edge.Kind {
		case "contained-by":
			contained++
		case "runs-on":
			runsOn++
		}
	}
	if contained != 3 || runsOn != 1 {
		t.Fatalf("expected three containment and one plan edge, got %+v", edges)
	}
}

func TestResourceRPCsReturnIndexedInventory(t *testing.T) {
	dataStore, err := store.Open(filepath.Join(t.TempDir(), "rpc-index.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer dataStore.Close()

	service := &Service{store: dataStore, now: func() time.Time {
		return time.Date(2026, 6, 22, 6, 0, 0, 0, time.UTC)
	}}
	workspace := models.WorkspaceSnapshot{
		Provider:  &models.ProviderSummary{ProviderID: "aws"},
		Profile:   &models.ProfileSummary{ProfileID: "sandbox"},
		S3Buckets: []models.AwsS3Bucket{{Name: "assets"}},
	}
	if _, err := service.indexWorkspaceSnapshot(context.Background(), workspace); err != nil {
		t.Fatalf("index workspace: %v", err)
	}

	result, err := service.Handle(context.Background(), "resources.list", json.RawMessage(`{"provider":"aws"}`), nil)
	if err != nil {
		t.Fatalf("resources.list: %v", err)
	}
	page, ok := result.(models.ResourceListResult)
	if !ok || page.Total != 1 || page.Resources[0].Name != "assets" {
		t.Fatalf("unexpected resource page: %#v", result)
	}

	params, _ := json.Marshal(map[string]string{
		"scopeId":    page.Resources[0].ScopeID,
		"resourceId": page.Resources[0].ID,
	})
	resourceResult, err := service.Handle(context.Background(), "resources.get", params, nil)
	if err != nil {
		t.Fatalf("resources.get: %v", err)
	}
	resource, ok := resourceResult.(models.ResourceRecord)
	if !ok || resource.Name != "assets" {
		t.Fatalf("unexpected resource: %#v", resourceResult)
	}

	statusResult, err := service.Handle(context.Background(), "inventory.status", nil, nil)
	if err != nil {
		t.Fatalf("inventory.status: %v", err)
	}
	runs, ok := statusResult.([]models.InventoryRun)
	if !ok || len(runs) != 1 || runs[0].ResourceCount != 1 {
		t.Fatalf("unexpected inventory status: %#v", statusResult)
	}

	overviewResult, err := service.Handle(context.Background(), "overview.get", nil, nil)
	if err != nil {
		t.Fatalf("overview.get: %v", err)
	}
	overview, ok := overviewResult.(models.CloudOverview)
	if !ok || overview.ResourceCount != 1 || overview.WorkspaceCount != 1 || len(overview.Services) != 1 {
		t.Fatalf("unexpected cloud overview: %#v", overviewResult)
	}
}

func findIndexedResource(resources []models.ResourceRecord, service string, name string) *models.ResourceRecord {
	for index := range resources {
		if resources[index].Service == service && resources[index].Name == name {
			return &resources[index]
		}
	}
	return nil
}
