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

func TestSignURLBuildsGcloudArgsAndParsesJSON(t *testing.T) {
	out := []byte(`[{
"resource": "gs://alpha-bucket/docs/readme.txt",
"signed_url": "https://storage.googleapis.com/alpha-bucket/docs/readme.txt?X-Goog-Signature=abc"
}]`)
	fake := &fakeCLI{out: out}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	result, err := inv.SignURL(context.Background(), gcpProfile(), "alpha-bucket", "docs/readme.txt", 1800)
	if err != nil {
		t.Fatalf("SignURL: %v", err)
	}
	if !strings.Contains(result.URL, "X-Goog-Signature=abc") {
		t.Fatalf("url = %q", result.URL)
	}
	if result.DurationSeconds != 1800 {
		t.Fatalf("duration = %d", result.DurationSeconds)
	}
	joined := strings.Join(fake.args, " ")
	if !strings.Contains(joined, "storage sign-url") {
		t.Fatalf("args missing sign-url: %v", fake.args)
	}
	if !strings.Contains(joined, "gs://alpha-bucket/docs/readme.txt") {
		t.Fatalf("args missing uri: %v", fake.args)
	}
	if !strings.Contains(joined, "--duration=1800s") {
		t.Fatalf("args missing duration: %v", fake.args)
	}
	if !strings.Contains(joined, "--http-verb=GET") {
		t.Fatalf("args missing http-verb: %v", fake.args)
	}
}

func TestClampGcpSignURLDuration(t *testing.T) {
	cases := []struct {
		in   int
		want int
	}{
		{0, 3600},
		{-1, 3600},
		{30, 60},
		{120, 120},
		{3600, 3600},
		{13 * 60 * 60, 12 * 60 * 60},
	}
	for _, tc := range cases {
		if got := clampGcpSignURLDuration(tc.in); got != tc.want {
			t.Fatalf("clampGcpSignURLDuration(%d) = %d, want %d", tc.in, got, tc.want)
		}
	}
}

func TestSignURLRejectsFolderPrefix(t *testing.T) {
	inv := NewInventory(config.Settings{})
	inv.runner = &fakeCLI{out: []byte(`[]`)}
	_, err := inv.SignURL(context.Background(), gcpProfile(), "alpha", "docs/", 3600)
	if err == nil {
		t.Fatal("expected folder rejection")
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

func TestListObjectsDecodesFoldersAndFiles(t *testing.T) {
	out := []byte(`[
		{"url": "gs://demo-bucket/logs/", "type": "prefix"},
		{
			"url": "gs://demo-bucket/readme.txt",
			"type": "cloud_object",
			"name": "readme.txt",
			"size": 12,
			"contentType": "text/plain",
			"updated": "2024-02-01T10:00:00Z"
		},
		{
			"url": "gs://demo-bucket/assets/",
			"type": "prefix"
		}
	]`)
	fake := &fakeCLI{out: out}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	page, err := inv.ListObjects(context.Background(), gcpProfile(), "demo-bucket", "", "")
	if err != nil {
		t.Fatalf("ListObjects: %v", err)
	}
	if len(page.Entries) != 3 {
		t.Fatalf("entries = %+v, want 3", page.Entries)
	}
	// Folders first, then files, both sorted.
	if !page.Entries[0].IsFolder || page.Entries[0].Key != "assets/" {
		t.Fatalf("first = %+v, want assets/ folder", page.Entries[0])
	}
	if !page.Entries[1].IsFolder || page.Entries[1].Key != "logs/" {
		t.Fatalf("second = %+v, want logs/ folder", page.Entries[1])
	}
	if page.Entries[2].IsFolder || page.Entries[2].Key != "readme.txt" {
		t.Fatalf("third = %+v, want readme.txt", page.Entries[2])
	}
	if page.Entries[2].ContentType != "text/plain" {
		t.Fatalf("contentType = %q", page.Entries[2].ContentType)
	}
	if page.Entries[2].Size == "" {
		t.Fatal("expected humanised size")
	}
	joined := strings.Join(fake.args, " ")
	if !strings.Contains(joined, "storage ls") || !strings.Contains(joined, "--json") {
		t.Fatalf("args = %v", fake.args)
	}
	if !strings.Contains(joined, "gs://demo-bucket") {
		t.Fatalf("args missing bucket url: %v", fake.args)
	}
}

func TestListObjectsUsesPrefixPathAndPageToken(t *testing.T) {
	fake := &fakeCLI{out: []byte(`[]`)}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	_, err := inv.ListObjects(context.Background(), gcpProfile(), "demo-bucket", "docs", "tok-1")
	if err != nil {
		t.Fatalf("ListObjects: %v", err)
	}
	joined := strings.Join(fake.args, " ")
	if !strings.Contains(joined, "gs://demo-bucket/docs/") {
		t.Fatalf("expected prefixed url with trailing slash, args=%v", fake.args)
	}
	if !strings.Contains(joined, "--next-page-token=tok-1") {
		t.Fatalf("expected page token, args=%v", fake.args)
	}
}

func TestListObjectsWrappedPageWithNextToken(t *testing.T) {
	out := []byte(`{
		"prefixes": ["logs/"],
		"items": [
			{"name": "readme.txt", "size": "100", "contentType": "text/plain", "updated": "2024-01-01T00:00:00Z"}
		],
		"nextPageToken": "page-2"
	}`)
	inv := NewInventory(config.Settings{})
	inv.runner = &fakeCLI{out: out}

	page, err := inv.ListObjects(context.Background(), gcpProfile(), "demo-bucket", "", "")
	if err != nil {
		t.Fatalf("ListObjects: %v", err)
	}
	if page.NextPageToken != "page-2" || !page.IsTruncated {
		t.Fatalf("page token = %+v", page)
	}
	if len(page.Entries) != 2 {
		t.Fatalf("entries = %+v", page.Entries)
	}
	if !page.Entries[0].IsFolder || page.Entries[0].Key != "logs/" {
		t.Fatalf("folder = %+v", page.Entries[0])
	}
}

func TestListObjectsRequiresBucket(t *testing.T) {
	inv := NewInventory(config.Settings{})
	inv.runner = &fakeCLI{out: []byte(`[]`)}
	_, err := inv.ListObjects(context.Background(), gcpProfile(), "", "", "")
	if err == nil {
		t.Fatal("expected error for empty bucket")
	}
}

func TestObjectListURL(t *testing.T) {
	if got := objectListURL("b", ""); got != "gs://b" {
		t.Fatalf("root = %q", got)
	}
	if got := objectListURL("b", "docs"); got != "gs://b/docs/" {
		t.Fatalf("docs = %q", got)
	}
	if got := objectListURL("b", "docs/"); got != "gs://b/docs/" {
		t.Fatalf("docs/ = %q", got)
	}
}

func TestUploadObjectBuildsGcloudCp(t *testing.T) {
	fake := &fakeCLI{out: []byte("")}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	result, err := inv.UploadObject(context.Background(), gcpProfile(), "demo-bucket", "docs/readme.txt", `C:\tmp\readme.txt`)
	if err != nil {
		t.Fatalf("UploadObject: %v", err)
	}
	if result.BucketName != "demo-bucket" || result.ObjectKey != "docs/readme.txt" {
		t.Fatalf("result = %+v", result)
	}
	if result.DestinationURI != "gs://demo-bucket/docs/readme.txt" {
		t.Fatalf("uri = %q", result.DestinationURI)
	}
	joined := strings.Join(fake.args, " ")
	if !strings.Contains(joined, "storage cp") {
		t.Fatalf("args missing storage cp: %v", fake.args)
	}
	if !strings.Contains(joined, `C:\tmp\readme.txt`) {
		t.Fatalf("args missing source path: %v", fake.args)
	}
	if !strings.Contains(joined, "gs://demo-bucket/docs/readme.txt") {
		t.Fatalf("args missing destination: %v", fake.args)
	}
	if !strings.Contains(joined, "--project platform-prod") {
		t.Fatalf("args missing project: %v", fake.args)
	}
}

func TestUploadObjectRequiresFields(t *testing.T) {
	inv := NewInventory(config.Settings{})
	inv.runner = &fakeCLI{}
	_, err := inv.UploadObject(context.Background(), gcpProfile(), "", "key", "/tmp/a")
	if err == nil {
		t.Fatal("expected error for empty bucket")
	}
}

func TestDeleteObjectBuildsGcloudRm(t *testing.T) {
	fake := &fakeCLI{out: []byte("")}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	if err := inv.DeleteObject(context.Background(), gcpProfile(), "demo-bucket", "docs/readme.txt"); err != nil {
		t.Fatalf("DeleteObject: %v", err)
	}
	joined := strings.Join(fake.args, " ")
	if !strings.Contains(joined, "storage rm") {
		t.Fatalf("args missing storage rm: %v", fake.args)
	}
	if !strings.Contains(joined, "gs://demo-bucket/docs/readme.txt") {
		t.Fatalf("args missing uri: %v", fake.args)
	}
}

func TestDeleteObjectRequiresFields(t *testing.T) {
	inv := NewInventory(config.Settings{})
	inv.runner = &fakeCLI{}
	if err := inv.DeleteObject(context.Background(), gcpProfile(), "bucket", ""); err == nil {
		t.Fatal("expected error for empty key")
	}
}
