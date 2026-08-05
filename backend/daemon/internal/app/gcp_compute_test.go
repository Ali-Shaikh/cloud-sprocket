// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"errors"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/models"
)

type stubGcpComputeInventory struct {
	instances  []models.GcpComputeInstance
	err        error
	startErr   error
	stopErr    error
	startCalls int
	stopCalls  int
	lastName   string
	lastZone   string
}

func (s *stubGcpComputeInventory) ListInstances(context.Context, models.ProfileSummary) ([]models.GcpComputeInstance, error) {
	if s.err != nil {
		return nil, s.err
	}
	return append([]models.GcpComputeInstance(nil), s.instances...), nil
}

func (s *stubGcpComputeInventory) StartInstance(_ context.Context, _ models.ProfileSummary, instanceName string, zone string) error {
	s.startCalls++
	s.lastName = instanceName
	s.lastZone = zone
	return s.startErr
}

func (s *stubGcpComputeInventory) StopInstance(_ context.Context, _ models.ProfileSummary, instanceName string, zone string) error {
	s.stopCalls++
	s.lastName = instanceName
	s.lastZone = zone
	return s.stopErr
}

func TestEnrichGcpComputeInventorySuccess(t *testing.T) {
	inv := &stubGcpComputeInventory{
		instances: []models.GcpComputeInstance{
			{Name: "web-1", Zone: "us-central1-a", Status: "RUNNING"},
			{Name: "web-2", Zone: "europe-west1-b", Status: "TERMINATED"},
		},
	}
	service := &Service{
		gcpCompute:  inv,
		preferences: defaultServicePreferences(),
	}
	workspace := models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "gcp"},
		Profile:  &models.ProfileSummary{ProfileID: "default", ProviderID: "gcp"},
	}
	service.enrichGcpComputeInventory(&workspace, models.SessionSnapshot{}, nil)

	if len(workspace.GcpComputeInstances) != 2 {
		t.Fatalf("instances = %+v", workspace.GcpComputeInstances)
	}
	if !strings.Contains(workspace.GcpComputeStatusMessage, "Loaded 2") {
		t.Fatalf("status = %q", workspace.GcpComputeStatusMessage)
	}
}

func TestEnrichGcpComputeInventorySurfacesListError(t *testing.T) {
	inv := &stubGcpComputeInventory{err: errors.New("gcloud not authenticated")}
	service := &Service{
		gcpCompute:  inv,
		preferences: defaultServicePreferences(),
	}
	workspace := models.WorkspaceSnapshot{
		Provider:            &models.ProviderSummary{ProviderID: "gcp"},
		Profile:             &models.ProfileSummary{ProfileID: "default", ProviderID: "gcp"},
		GcpComputeInstances: []models.GcpComputeInstance{},
	}
	service.enrichGcpComputeInventory(&workspace, models.SessionSnapshot{}, nil)

	if len(workspace.GcpComputeInstances) != 0 {
		t.Fatalf("instances = %+v, want empty on error", workspace.GcpComputeInstances)
	}
	if !strings.Contains(workspace.GcpComputeStatusMessage, "Could not list Compute Engine instances") {
		t.Fatalf("status = %q", workspace.GcpComputeStatusMessage)
	}
	if !strings.Contains(workspace.GcpComputeStatusMessage, "gcloud not authenticated") {
		t.Fatalf("status missing detail: %q", workspace.GcpComputeStatusMessage)
	}
}

func TestEnrichGcpComputeInventorySkipsWhenDisabled(t *testing.T) {
	inv := &stubGcpComputeInventory{
		instances: []models.GcpComputeInstance{{Name: "hidden"}},
	}
	service := &Service{
		gcpCompute: inv,
		preferences: models.ServicePreferences{
			DisabledServices: map[string][]string{
				"gcp": {"gcp-compute"},
			},
		},
	}
	workspace := models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "gcp"},
		Profile:  &models.ProfileSummary{ProfileID: "default", ProviderID: "gcp"},
	}
	service.enrichGcpComputeInventory(&workspace, models.SessionSnapshot{}, nil)
	if len(workspace.GcpComputeInstances) != 0 {
		t.Fatalf("instances = %+v, want empty when disabled", workspace.GcpComputeInstances)
	}
}

func TestSelectedGcpComputeInstanceRequiresListedName(t *testing.T) {
	service := &Service{}
	instances := []models.GcpComputeInstance{{Name: "web-1"}, {Name: "web-2"}}
	if got := service.selectedGcpComputeInstance(models.SessionSnapshot{SelectedGcpComputeInstance: "missing"}, instances); got != "" {
		t.Fatalf("selected = %q, want empty", got)
	}
	if got := service.selectedGcpComputeInstance(models.SessionSnapshot{SelectedGcpComputeInstance: "web-2"}, instances); got != "web-2" {
		t.Fatalf("selected = %q, want web-2", got)
	}
}

func TestHandleGcpComputeLifecycleRequiresWriteMode(t *testing.T) {
	// Reuse the storage test harness profile (gcloud config under home).
	compute := &stubGcpComputeInventory{
		instances: []models.GcpComputeInstance{
			{Name: "web-1", Zone: "us-central1-a", Status: "TERMINATED"},
		},
	}
	service := gcpStorageTestService(t, &stubGcpStorageInventory{})
	service.gcpCompute = compute
	lockGcpWorkspace(t, service)

	params := []byte(`{"instanceName":"web-1","zone":"us-central1-a"}`)
	_, err := service.Handle(context.Background(), "gcp.compute.startInstance", params, nil)
	if err == nil {
		t.Fatal("expected write mode gate for start")
	}
	if !strings.Contains(err.Error(), "write mode") {
		t.Fatalf("error = %v, want write mode", err)
	}
	if compute.startCalls != 0 {
		t.Fatalf("startCalls = %d, want 0", compute.startCalls)
	}

	if _, err := service.Handle(context.Background(), "session.setWriteMode", []byte(`{"enabled":true}`), nil); err != nil {
		t.Fatalf("setWriteMode: %v", err)
	}
	if _, err := service.Handle(context.Background(), "gcp.compute.startInstance", params, nil); err != nil {
		t.Fatalf("startInstance: %v", err)
	}
	if compute.startCalls != 1 || compute.lastName != "web-1" || compute.lastZone != "us-central1-a" {
		t.Fatalf("start calls=%d name=%q zone=%q", compute.startCalls, compute.lastName, compute.lastZone)
	}

	if _, err := service.Handle(context.Background(), "gcp.compute.stopInstance", params, nil); err != nil {
		t.Fatalf("stopInstance: %v", err)
	}
	if compute.stopCalls != 1 {
		t.Fatalf("stopCalls = %d, want 1", compute.stopCalls)
	}
}
