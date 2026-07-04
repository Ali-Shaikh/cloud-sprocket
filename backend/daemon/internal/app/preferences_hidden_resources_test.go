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

func TestDisabledCatalogueEntriesSkipsComingSoon(t *testing.T) {
	service := &Service{
		preferences: models.ServicePreferences{
			DisabledServices: map[string][]string{
				"gcp": {"gcp-storage"},
			},
		},
	}
	entries := service.disabledCatalogueEntries("gcp")
	if len(entries) != 0 {
		t.Fatalf("coming soon entries should not be probed: %+v", entries)
	}
}