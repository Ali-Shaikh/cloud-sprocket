// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"testing"

	"cloudsprocket/backend/daemon/internal/models"
)

type fakePostgresConnectionInventory struct {
	stubAzureInventory
	connection models.AzurePostgresConnection
}

func (f fakePostgresConnectionInventory) GetPostgresConnection(context.Context, models.ProfileSummary, string, string) (models.AzurePostgresConnection, error) {
	return f.connection, nil
}

func TestAzurePostgresConnectionSuppressesIncompleteResult(t *testing.T) {
	service := &Service{azure: fakePostgresConnectionInventory{
		connection: models.AzurePostgresConnection{Host: "", Port: 0},
	}}
	if got := service.azurePostgresConnection(context.Background(), models.ProfileSummary{}, "demo-rg", "lab-dev-pg"); got != nil {
		t.Fatalf("expected nil connection for incomplete result, got %+v", got)
	}
}

func TestAzurePostgresConnectionReturnsCompleteResult(t *testing.T) {
	want := models.AzurePostgresConnection{Host: "localhost", Port: 54983}
	service := &Service{azure: fakePostgresConnectionInventory{connection: want}}
	got := service.azurePostgresConnection(context.Background(), models.ProfileSummary{}, "demo-rg", "lab-dev-pg")
	if got == nil || *got != want {
		t.Fatalf("expected %+v, got %+v", want, got)
	}
}

func TestAzurePostgresConnectionReturnsNilForEmptyServerName(t *testing.T) {
	service := &Service{}
	if got := service.azurePostgresConnection(context.Background(), models.ProfileSummary{}, "demo-rg", ""); got != nil {
		t.Fatalf("expected nil for empty server name, got %+v", got)
	}
}

func TestResourceGroupForPostgresServer(t *testing.T) {
	servers := []models.AzurePostgresServer{
		{Name: "a", ResourceGroup: "rg-a"},
		{Name: "b", ResourceGroup: "rg-b"},
	}
	if got := resourceGroupForPostgresServer(servers, "b"); got != "rg-b" {
		t.Fatalf("got %q", got)
	}
	if got := resourceGroupForPostgresServer(servers, "missing"); got != "" {
		t.Fatalf("got %q", got)
	}
}
