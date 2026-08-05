// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"testing"

	"cloudsprocket/backend/daemon/internal/models"
)

func TestCountCatalogueResourcesDetectsAwsS3Buckets(t *testing.T) {
	workspace := &models.WorkspaceSnapshot{
		S3Buckets: []models.AwsS3Bucket{{Name: "demo"}},
	}
	count, ok := countCatalogueResources(workspace, "aws", "s3")
	if !ok || count != 1 {
		t.Fatalf("count = %d ok = %v", count, ok)
	}
}

func TestDisabledCatalogueEntriesIncludesLiveGcpFunctions(t *testing.T) {
	service := &Service{
		preferences: models.ServicePreferences{
			DisabledServices: map[string][]string{
				"gcp": {"gcp-functions"},
			},
		},
	}
	entries := service.disabledCatalogueEntries("gcp")
	if len(entries) != 1 || entries[0].ServiceID != "gcp-functions" {
		t.Fatalf("disabled live entries = %+v, want gcp-functions only", entries)
	}
}

func TestDisabledCatalogueEntriesIncludesLiveGcpGke(t *testing.T) {
	service := &Service{
		preferences: models.ServicePreferences{
			DisabledServices: map[string][]string{
				"gcp": {"gcp-gke"},
			},
		},
	}
	entries := service.disabledCatalogueEntries("gcp")
	if len(entries) != 1 || entries[0].ServiceID != "gcp-gke" {
		t.Fatalf("disabled live entries = %+v, want gcp-gke only", entries)
	}
}

func TestCountCatalogueResourcesDetectsGcpFunctionsAndGke(t *testing.T) {
	workspace := &models.WorkspaceSnapshot{
		GcpFunctions:   []models.GcpCloudFunction{{Name: "fn"}},
		GcpGkeClusters: []models.GcpGkeCluster{{Name: "cluster"}},
	}
	count, ok := countCatalogueResources(workspace, "gcp", "gcp-functions")
	if !ok || count != 1 {
		t.Fatalf("functions count = %d ok = %v", count, ok)
	}
	count, ok = countCatalogueResources(workspace, "gcp", "gcp-gke")
	if !ok || count != 1 {
		t.Fatalf("gke count = %d ok = %v", count, ok)
	}
}

func TestDisabledCatalogueEntriesIncludesLiveGcpCompute(t *testing.T) {
	service := &Service{
		preferences: models.ServicePreferences{
			DisabledServices: map[string][]string{
				"gcp": {"gcp-compute"},
			},
		},
	}
	entries := service.disabledCatalogueEntries("gcp")
	if len(entries) != 1 || entries[0].ServiceID != "gcp-compute" {
		t.Fatalf("disabled live entries = %+v, want gcp-compute only", entries)
	}
}

func TestDisabledCatalogueEntriesIncludesLiveGcpStorage(t *testing.T) {
	service := &Service{
		preferences: models.ServicePreferences{
			DisabledServices: map[string][]string{
				"gcp": {"gcp-storage"},
			},
		},
	}
	entries := service.disabledCatalogueEntries("gcp")
	if len(entries) != 1 || entries[0].ServiceID != "gcp-storage" {
		t.Fatalf("disabled live entries = %+v, want gcp-storage only", entries)
	}
}

func TestCountCatalogueResourcesDetectsGcpStorageBuckets(t *testing.T) {
	workspace := &models.WorkspaceSnapshot{
		GcpStorageBuckets: []models.GcpStorageBucket{{Name: "demo"}},
	}
	count, ok := countCatalogueResources(workspace, "gcp", "gcp-storage")
	if !ok || count != 1 {
		t.Fatalf("count = %d ok = %v", count, ok)
	}
}
