// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package gcpadapter

import (
	"context"
	"errors"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

type fakeCLI struct {
	out  []byte
	err  error
	name string
	args []string
}

func (f *fakeCLI) CommandContext(_ context.Context, name string, args ...string) ([]byte, error) {
	f.name = name
	f.args = append([]string(nil), args...)
	return f.out, f.err
}

func gcpProfile() models.ProfileSummary {
	return models.ProfileSummary{
		ProviderID:  "gcp",
		ProfileID:   "default",
		DisplayName: "platform",
		Attributes: []models.DetailField{
			{Label: "Configuration", Value: "default"},
			{Label: "Account", Value: "ali@example.com"},
			{Label: "Project", Value: "platform-prod"},
		},
	}
}

func TestListBucketsDecodesAndSorts(t *testing.T) {
	out := []byte(`[
		{
			"name": "gs://zeta-bucket/",
			"location": "EU",
			"location_type": "multi-region",
			"default_storage_class": "STANDARD",
			"creation_time": "2024-01-02T03:04:05+00:00"
		},
		{
			"name": "alpha-bucket",
			"location": "us-central1",
			"locationType": "region",
			"storageClass": "NEARLINE",
			"timeCreated": "2023-06-01T12:00:00Z"
		}
	]`)
	fake := &fakeCLI{out: out}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	buckets, err := inv.ListBuckets(context.Background(), gcpProfile())
	if err != nil {
		t.Fatalf("ListBuckets: %v", err)
	}
	if len(buckets) != 2 {
		t.Fatalf("len = %d, want 2: %+v", len(buckets), buckets)
	}
	if buckets[0].Name != "alpha-bucket" {
		t.Fatalf("first name = %q, want alpha-bucket (sorted)", buckets[0].Name)
	}
	if buckets[0].Location != "us-central1" || buckets[0].StorageClass != "NEARLINE" {
		t.Fatalf("alpha bucket = %+v", buckets[0])
	}
	if buckets[1].Name != "zeta-bucket" {
		t.Fatalf("second name = %q, want zeta-bucket", buckets[1].Name)
	}
	if buckets[1].LocationType != "multi-region" || buckets[1].StorageClass != "STANDARD" {
		t.Fatalf("zeta bucket = %+v", buckets[1])
	}
	if fake.name != "gcloud" {
		t.Fatalf("command = %q, want gcloud", fake.name)
	}
	joined := strings.Join(fake.args, " ")
	if !strings.Contains(joined, "--configuration=default") {
		t.Fatalf("args missing configuration: %v", fake.args)
	}
	if !strings.Contains(joined, "storage buckets list") {
		t.Fatalf("args missing storage buckets list: %v", fake.args)
	}
	if !strings.Contains(joined, "--project platform-prod") {
		t.Fatalf("args missing project: %v", fake.args)
	}
	if !strings.Contains(joined, "--format=json") {
		t.Fatalf("args missing format: %v", fake.args)
	}
}

func TestListBucketsEmptyPayload(t *testing.T) {
	inv := NewInventory(config.Settings{})
	inv.runner = &fakeCLI{out: []byte("[]")}
	buckets, err := inv.ListBuckets(context.Background(), gcpProfile())
	if err != nil {
		t.Fatalf("ListBuckets: %v", err)
	}
	if len(buckets) != 0 {
		t.Fatalf("buckets = %+v, want empty", buckets)
	}
}

func TestListBucketsCLIError(t *testing.T) {
	inv := NewInventory(config.Settings{})
	inv.runner = &fakeCLI{err: errors.New("exit status 1")}
	_, err := inv.ListBuckets(context.Background(), gcpProfile())
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "gcloud") {
		t.Fatalf("error = %v, want gcloud prefix", err)
	}
}

func TestNormaliseBucketName(t *testing.T) {
	cases := map[string]string{
		"gs://my-bucket/": "my-bucket",
		"gs://my-bucket":  "my-bucket",
		"my-bucket":       "my-bucket",
		"  ":              "",
	}
	for input, want := range cases {
		if got := normaliseBucketName(input); got != want {
			t.Fatalf("normaliseBucketName(%q) = %q, want %q", input, got, want)
		}
	}
}
