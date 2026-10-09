// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
)

func TestEnrichS3InventorySaysTheBucketListFailed(t *testing.T) {
	service := s3StatusTestService(t, &stubS3Inventory{
		listBucketsErr: errors.New("access denied"),
	})
	workspace := awsS3Workspace()

	service.enrichS3Inventory(&workspace, models.SessionSnapshot{}, awsEnrichmentOptions{}, nil)

	if len(workspace.S3Buckets) != 0 {
		t.Fatalf("buckets = %+v", workspace.S3Buckets)
	}
	if !strings.Contains(workspace.S3StatusMessage, "Could not list S3 buckets") {
		t.Fatalf("status = %q", workspace.S3StatusMessage)
	}
	if strings.Contains(workspace.S3StatusMessage, "No buckets are currently available") {
		t.Fatalf("status = %q", workspace.S3StatusMessage)
	}
	if !strings.Contains(workspace.S3StatusMessage, "access denied") {
		t.Fatalf("status missing detail: %q", workspace.S3StatusMessage)
	}
}

func TestEnrichS3InventorySaysTheObjectListFailed(t *testing.T) {
	service := s3StatusTestService(t, &stubS3Inventory{
		buckets:        []models.AwsS3Bucket{{Name: "alpha"}},
		listObjectsErr: errors.New("slow down"),
	})
	workspace := awsS3Workspace()

	service.enrichS3Inventory(&workspace, models.SessionSnapshot{}, awsEnrichmentOptions{}, nil)

	if workspace.SelectedS3BucketName != "alpha" {
		t.Fatalf("selected = %q", workspace.SelectedS3BucketName)
	}
	if len(workspace.S3Objects) != 0 {
		t.Fatalf("objects = %+v", workspace.S3Objects)
	}
	if !strings.Contains(workspace.S3StatusMessage, "Could not list objects in alpha") {
		t.Fatalf("status = %q", workspace.S3StatusMessage)
	}
	if strings.Contains(workspace.S3StatusMessage, "This folder is empty") {
		t.Fatalf("status = %q", workspace.S3StatusMessage)
	}
}

func TestEnrichS3InventoryKeepsCachedBucketsWhenTheRefreshFails(t *testing.T) {
	inventory := &stubS3Inventory{listBucketsErr: errors.New("expired token")}
	service := s3StatusTestService(t, inventory)
	profile := awsS3Workspace().Profile
	err := service.store.SaveResourceCache(
		context.Background(),
		"aws.s3.buckets",
		profile.ProfileID,
		[]models.AwsS3Bucket{{Name: "cached-bucket"}},
		time.Now().UTC().Add(-2*time.Hour).Format(time.RFC3339),
	)
	if err != nil {
		t.Fatalf("SaveResourceCache: %v", err)
	}
	workspace := awsS3Workspace()

	service.enrichS3Inventory(&workspace, models.SessionSnapshot{}, awsEnrichmentOptions{lightweight: true}, nil)

	if len(workspace.S3Buckets) != 1 || workspace.S3Buckets[0].Name != "cached-bucket" {
		t.Fatalf("buckets = %+v", workspace.S3Buckets)
	}
	if !strings.Contains(workspace.S3StatusMessage, "Could not refresh the live list") {
		t.Fatalf("status = %q", workspace.S3StatusMessage)
	}
	if strings.Contains(workspace.S3StatusMessage, "No buckets are currently available") {
		t.Fatalf("status = %q", workspace.S3StatusMessage)
	}
}

func TestS3ListFailureStatusKeepsObjectFailureBesideCachedBuckets(t *testing.T) {
	message, failed := s3ListFailureStatus(
		[]models.AwsS3Bucket{{Name: "alpha"}},
		"alpha",
		"",
		nil,
		errors.New("bucket refresh failed"),
		errors.New("object list failed"),
	)
	if !failed {
		t.Fatal("expected a failure status")
	}
	if !strings.Contains(message, "Could not refresh the live list") {
		t.Fatalf("status = %q", message)
	}
	if !strings.Contains(message, "Could not list objects in alpha") {
		t.Fatalf("status = %q", message)
	}
}

func TestS3ListFailureStatusLeavesAnEmptyFolderAlone(t *testing.T) {
	message, failed := s3ListFailureStatus(
		[]models.AwsS3Bucket{{Name: "alpha"}},
		"alpha",
		"",
		nil,
		nil,
		nil,
	)
	if failed {
		t.Fatalf("status = %q", message)
	}
}

func s3StatusTestService(t *testing.T, inventory *stubS3Inventory) *Service {
	t.Helper()
	dataStore, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = dataStore.Close() })
	return &Service{
		store: dataStore,
		s3:    inventory,
		now:   func() time.Time { return time.Now().UTC() },
	}
}

func awsS3Workspace() models.WorkspaceSnapshot {
	return models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "aws", Label: "AWS"},
		Profile: &models.ProfileSummary{
			ProviderID:  "aws",
			ProfileID:   "sandbox",
			DisplayName: "sandbox",
		},
	}
}
