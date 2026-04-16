package app

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
)

type stubS3Inventory struct {
	buckets  []models.AwsS3Bucket
	objects  map[string][]models.AwsS3Object
	metadata map[string][]models.DetailField
}

func (s stubS3Inventory) ListBuckets(context.Context, models.ProfileSummary) ([]models.AwsS3Bucket, error) {
	return append([]models.AwsS3Bucket(nil), s.buckets...), nil
}

func (s stubS3Inventory) ListObjects(_ context.Context, _ models.ProfileSummary, bucketName string, prefix string) ([]models.AwsS3Object, error) {
	objects := append([]models.AwsS3Object(nil), s.objects[bucketName]...)
	if prefix == "" {
		return objects, nil
	}
	filtered := []models.AwsS3Object{}
	for _, object := range objects {
		if len(object.Key) >= len(prefix) && object.Key[:len(prefix)] == prefix {
			filtered = append(filtered, object)
		}
	}
	return filtered, nil
}

func (s stubS3Inventory) HeadObject(_ context.Context, _ models.ProfileSummary, bucketName string, objectKey string) ([]models.DetailField, error) {
	return append([]models.DetailField(nil), s.metadata[bucketName+"|"+objectKey]...), nil
}

func TestServiceLocksSessionAndListsLogs(t *testing.T) {
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")

	mustWriteFile(t, filepath.Join(home, ".aws", "config"), "[profile sandbox]\nregion = us-east-1\nsso_start_url = https://example.awsapps.com/start\n")
	mustWriteFile(t, filepath.Join(home, ".aws", "credentials"), "[sandbox]\naws_access_key_id = AKIAEXAMPLE\n")

	settings := config.FromEnv(map[string]string{}, "linux", home)
	if err := settings.EnsureRuntimeDirs(); err != nil {
		t.Fatalf("expected runtime dirs to be created, got %v", err)
	}

	dataStore, err := store.Open(settings.DatabasePath)
	if err != nil {
		t.Fatalf("expected sqlite store to open, got %v", err)
	}
	defer dataStore.Close()

	service := New(
		settings,
		dataStore,
		discovery.New(settings, func(command string) (string, error) {
			if command == "aws" {
				return "/usr/bin/aws", nil
			}
			return "", nil
		}),
		stubS3Inventory{
			buckets: []models.AwsS3Bucket{
				{Name: "cloudsprocket-artifacts"},
			},
			objects: map[string][]models.AwsS3Object{
				"cloudsprocket-artifacts": {
					{Key: "reports/daily.json", Size: "12 MB"},
					{Key: "uploads/demo-package.zip", Size: "42 MB"},
				},
			},
			metadata: map[string][]models.DetailField{
				"cloudsprocket-artifacts|reports/daily.json": {
					{Label: "Bucket", Value: "cloudsprocket-artifacts"},
					{Label: "Key", Value: "reports/daily.json"},
				},
			},
		},
	)

	ctx := context.Background()
	result, err := service.Handle(ctx, "session.get", nil, nil)
	if err != nil {
		t.Fatalf("expected session.get to succeed, got %v", err)
	}
	session := result.(models.SessionSnapshot)
	if session.SelectedProfileID != "sandbox" {
		t.Fatalf("expected default session to select sandbox, got %+v", session)
	}

	if _, err := service.Handle(ctx, "session.lock", nil, nil); err != nil {
		t.Fatalf("expected session.lock to succeed, got %v", err)
	}

	workspaceResult, err := service.Handle(ctx, "workspace.get", nil, nil)
	if err != nil {
		t.Fatalf("expected workspace.get to succeed, got %v", err)
	}
	workspace := workspaceResult.(models.WorkspaceSnapshot)
	if workspace.Provider == nil || workspace.Provider.ProviderID != "aws" {
		t.Fatalf("expected workspace provider to be aws, got %+v", workspace.Provider)
	}
	if workspace.Profile == nil || workspace.Profile.ProfileID != "sandbox" {
		t.Fatalf("expected workspace profile to be sandbox, got %+v", workspace.Profile)
	}
	if workspace.AuthMethod != models.AuthMethodCLI {
		t.Fatalf("expected workspace auth method to be cli, got %s", workspace.AuthMethod)
	}
	if len(workspace.S3Buckets) != 1 || workspace.S3Buckets[0].Name != "cloudsprocket-artifacts" {
		t.Fatalf("expected workspace buckets to come from the s3 inventory, got %+v", workspace.S3Buckets)
	}
	if workspace.SelectedS3BucketName != "cloudsprocket-artifacts" {
		t.Fatalf("expected workspace to select the first bucket, got %q", workspace.SelectedS3BucketName)
	}
	if len(workspace.S3Objects) != 2 || workspace.S3Objects[0].Key != "reports/daily.json" {
		t.Fatalf("expected workspace objects to come from the s3 inventory, got %+v", workspace.S3Objects)
	}
	if workspace.SelectedS3ObjectKey != "reports/daily.json" {
		t.Fatalf("expected workspace to select the first object, got %q", workspace.SelectedS3ObjectKey)
	}
	if len(workspace.S3ObjectMetadata) == 0 {
		t.Fatalf("expected workspace metadata to be populated for the selected object")
	}
	if workspace.RuntimeSettings.DatabasePath == "" {
		t.Fatalf("expected workspace runtime settings to include a database path")
	}

	selectionResult, err := service.Handle(ctx, "aws.s3.selectBucket", []byte(`{"bucketName":"cloudsprocket-artifacts"}`), nil)
	if err != nil {
		t.Fatalf("expected aws.s3.selectBucket to succeed, got %v", err)
	}
	selectedWorkspace := selectionResult.(models.WorkspaceSnapshot)
	if selectedWorkspace.SelectedS3BucketName != "cloudsprocket-artifacts" {
		t.Fatalf("expected selected workspace bucket to be persisted, got %q", selectedWorkspace.SelectedS3BucketName)
	}

	objectResult, err := service.Handle(ctx, "aws.s3.selectObject", []byte(`{"objectKey":"uploads/demo-package.zip"}`), nil)
	if err != nil {
		t.Fatalf("expected aws.s3.selectObject to succeed, got %v", err)
	}
	selectedObjectWorkspace := objectResult.(models.WorkspaceSnapshot)
	if selectedObjectWorkspace.SelectedS3ObjectKey != "uploads/demo-package.zip" {
		t.Fatalf("expected selected workspace object to be persisted, got %q", selectedObjectWorkspace.SelectedS3ObjectKey)
	}

	filteredResult, err := service.Handle(ctx, "aws.s3.setPrefixFilter", []byte(`{"prefix":"reports/"}`), nil)
	if err != nil {
		t.Fatalf("expected aws.s3.setPrefixFilter to succeed, got %v", err)
	}
	filteredWorkspace := filteredResult.(models.WorkspaceSnapshot)
	if filteredWorkspace.S3PrefixFilter != "reports/" {
		t.Fatalf("expected prefix filter to be stored, got %q", filteredWorkspace.S3PrefixFilter)
	}
	if len(filteredWorkspace.S3Objects) != 1 || filteredWorkspace.S3Objects[0].Key != "reports/daily.json" {
		t.Fatalf("expected prefix filtering to reduce visible objects, got %+v", filteredWorkspace.S3Objects)
	}

	logs, err := service.Handle(ctx, "logs.list", []byte(`{"limit":10}`), nil)
	if err != nil {
		t.Fatalf("expected logs.list to succeed, got %v", err)
	}
	if len(logs.([]models.ActivityLogEntry)) == 0 {
		t.Fatalf("expected lock action to append a log entry")
	}
}

func mustWriteFile(t *testing.T, path string, contents string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("failed to create directory for %s: %v", path, err)
	}
	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatalf("failed to write %s: %v", path, err)
	}
}
