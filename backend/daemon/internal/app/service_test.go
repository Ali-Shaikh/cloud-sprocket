package app

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
)

type stubS3Inventory struct {
	buckets       []models.AwsS3Bucket
	objects       map[string][]models.AwsS3Object
	metadata      map[string][]models.DetailField
	uploaded      []models.AwsS3UploadResult
	presignedURLs map[string]string
}

type stubEC2Inventory struct {
	regions        []string
	instances      map[string][]models.AwsEc2Instance
	actionRequests []string
	actionErrors   map[string]error
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

func (s *stubS3Inventory) UploadFile(_ context.Context, _ models.ProfileSummary, bucketName string, objectKey string, _ string) (models.AwsS3UploadResult, error) {
	result := models.AwsS3UploadResult{
		BucketName:     bucketName,
		ObjectKey:      objectKey,
		DestinationURI: "s3://" + bucketName + "/" + objectKey,
	}
	s.uploaded = append(s.uploaded, result)
	return result, nil
}

func (s stubS3Inventory) PresignGetObject(_ context.Context, _ models.ProfileSummary, bucketName string, objectKey string, durationSeconds int) (models.AwsS3PresignResult, error) {
	url := s.presignedURLs[bucketName+"|"+objectKey]
	if url == "" {
		url = "https://example.invalid/" + objectKey
	}
	return models.AwsS3PresignResult{
		BucketName:      bucketName,
		ObjectKey:       objectKey,
		URL:             url,
		DurationSeconds: durationSeconds,
		ExpiresAt:       "2026-04-26T12:00:00Z",
	}, nil
}

func (s stubEC2Inventory) ListRegions(context.Context, models.ProfileSummary) ([]string, error) {
	return append([]string(nil), s.regions...), nil
}

func (s stubEC2Inventory) ListInstances(_ context.Context, _ models.ProfileSummary, region string) ([]models.AwsEc2Instance, error) {
	return append([]models.AwsEc2Instance(nil), s.instances[region]...), nil
}

func (s *stubEC2Inventory) StartInstance(_ context.Context, _ models.ProfileSummary, region string, instanceID string) error {
	s.actionRequests = append(s.actionRequests, "start|"+region+"|"+instanceID)
	return s.actionErrors["start"]
}

func (s *stubEC2Inventory) StopInstance(_ context.Context, _ models.ProfileSummary, region string, instanceID string) error {
	s.actionRequests = append(s.actionRequests, "stop|"+region+"|"+instanceID)
	return s.actionErrors["stop"]
}

func (s *stubEC2Inventory) RebootInstance(_ context.Context, _ models.ProfileSummary, region string, instanceID string) error {
	s.actionRequests = append(s.actionRequests, "reboot|"+region+"|"+instanceID)
	return s.actionErrors["reboot"]
}

type recordingNotifier struct {
	events chan models.JobStatus
}

func (r recordingNotifier) Notify(method string, payload any) error {
	if method != "job.updated" {
		return nil
	}
	if job, ok := payload.(models.JobStatus); ok {
		r.events <- job
	}
	return nil
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

	s3Inventory := &stubS3Inventory{
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
		presignedURLs: map[string]string{
			"cloudsprocket-artifacts|reports/daily.json": "https://example-bucket.s3.amazonaws.com/reports/daily.json?X-Amz-Signature=abc",
		},
	}
	ec2Inventory := &stubEC2Inventory{
		regions: []string{"us-east-1", "eu-west-2"},
		instances: map[string][]models.AwsEc2Instance{
			"us-east-1": {
				{InstanceID: "i-0123456789abcdef0", Name: "sandbox-app", State: "running", InstanceType: "t3.small"},
			},
		},
	}
	service := New(
		settings,
		dataStore,
		discovery.New(settings, func(command string) (string, error) {
			if command == "aws" {
				return "/usr/bin/aws", nil
			}
			return "", nil
		}),
		s3Inventory,
		ec2Inventory,
	)
	service.now = func() time.Time { return time.Date(2026, 4, 26, 10, 0, 0, 0, time.UTC) }

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
	if workspace.SelectedEC2Region != "us-east-1" || len(workspace.EC2Instances) != 1 {
		t.Fatalf("expected EC2 inventory for default region, got region=%q instances=%+v", workspace.SelectedEC2Region, workspace.EC2Instances)
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
	if filteredWorkspace.SelectedS3ObjectKey != "reports/daily.json" {
		t.Fatalf("expected prefix filtering to select the first matching object, got %q", filteredWorkspace.SelectedS3ObjectKey)
	}
	if len(filteredWorkspace.S3ObjectMetadata) == 0 || filteredWorkspace.S3ObjectMetadata[1].Value != "reports/daily.json" {
		t.Fatalf("expected prefix-filtered object metadata to be loaded, got %+v", filteredWorkspace.S3ObjectMetadata)
	}
	if len(filteredWorkspace.S3ExportSnippets) == 0 || !strings.Contains(filteredWorkspace.S3ExportSnippets[0].Value, "s3://cloudsprocket-artifacts/reports/daily.json") {
		t.Fatalf("expected export snippets for the selected object, got %+v", filteredWorkspace.S3ExportSnippets)
	}

	uploadNotifier := recordingNotifier{events: make(chan models.JobStatus, 4)}
	uploadResult, err := service.Handle(ctx, "aws.s3.uploadObject", []byte(`{"sourcePath":"/tmp/demo.txt","objectKey":"reports/uploaded.txt"}`), uploadNotifier)
	if err != nil {
		t.Fatalf("expected aws.s3.uploadObject to queue a job, got %v", err)
	}
	if uploadResult.(models.JobStatus).Status != "queued" {
		t.Fatalf("expected queued upload job, got %+v", uploadResult)
	}
	completedUpload := waitForJobStatus(t, uploadNotifier.events, "completed")
	if completedUpload.Result == nil || len(s3Inventory.uploaded) != 1 {
		t.Fatalf("expected upload job result and upload call, got job=%+v uploads=%+v", completedUpload, s3Inventory.uploaded)
	}

	presignNotifier := recordingNotifier{events: make(chan models.JobStatus, 4)}
	presignResult, err := service.Handle(ctx, "aws.s3.presignObject", []byte(`{"durationSeconds":7200}`), presignNotifier)
	if err != nil {
		t.Fatalf("expected aws.s3.presignObject to queue a job, got %v", err)
	}
	if presignResult.(models.JobStatus).Status != "queued" {
		t.Fatalf("expected queued presign job, got %+v", presignResult)
	}
	completedPresign := waitForJobStatus(t, presignNotifier.events, "completed")
	if completedPresign.Result == nil || !strings.Contains(completedPresign.Message, "signed URL") {
		t.Fatalf("expected completed presign job with result, got %+v", completedPresign)
	}

	inspection, err := service.Handle(ctx, "aws.s3.analyseUrl", []byte(`{"url":"https://example-bucket.s3.amazonaws.com/reports/daily.json?X-Amz-Date=20260426T100000Z&X-Amz-Expires=3600"}`), nil)
	if err != nil {
		t.Fatalf("expected aws.s3.analyseUrl to succeed, got %v", err)
	}
	if !strings.Contains(inspection.(models.URLInspection).Summary, "Nominal expiry") {
		t.Fatalf("expected expiry analysis, got %+v", inspection)
	}

	ec2RegionResult, err := service.Handle(ctx, "aws.ec2.selectRegion", []byte(`{"region":"eu-west-2"}`), nil)
	if err != nil {
		t.Fatalf("expected aws.ec2.selectRegion to succeed, got %v", err)
	}
	ec2RegionWorkspace := ec2RegionResult.(models.WorkspaceSnapshot)
	if ec2RegionWorkspace.SelectedEC2Region != "eu-west-2" {
		t.Fatalf("expected selected EC2 region to be persisted, got %q", ec2RegionWorkspace.SelectedEC2Region)
	}
	if len(ec2RegionWorkspace.EC2Instances) != 0 || !strings.Contains(ec2RegionWorkspace.EC2StatusMessage, "No EC2 instances") {
		t.Fatalf("expected empty EC2 state for eu-west-2, got instances=%+v message=%q", ec2RegionWorkspace.EC2Instances, ec2RegionWorkspace.EC2StatusMessage)
	}

	if _, err := service.Handle(ctx, "aws.ec2.selectRegion", []byte(`{"region":"us-east-1"}`), nil); err != nil {
		t.Fatalf("expected aws.ec2.selectRegion reset to succeed, got %v", err)
	}
	if _, err := service.Handle(ctx, "aws.ec2.selectInstance", []byte(`{"instanceId":"i-0123456789abcdef0"}`), nil); err != nil {
		t.Fatalf("expected aws.ec2.selectInstance to succeed, got %v", err)
	}
	ec2Notifier := recordingNotifier{events: make(chan models.JobStatus, 4)}
	ec2ActionResult, err := service.Handle(ctx, "aws.ec2.invokeAction", []byte(`{"action":"reboot"}`), ec2Notifier)
	if err != nil {
		t.Fatalf("expected aws.ec2.invokeAction to queue a job, got %v", err)
	}
	if ec2ActionResult.(models.JobStatus).Status != "queued" {
		t.Fatalf("expected queued EC2 job, got %+v", ec2ActionResult)
	}
	waitForJobStatus(t, ec2Notifier.events, "completed")
	if len(ec2Inventory.actionRequests) != 1 || ec2Inventory.actionRequests[0] != "reboot|us-east-1|i-0123456789abcdef0" {
		t.Fatalf("expected reboot request to hit EC2 inventory, got %+v", ec2Inventory.actionRequests)
	}

	logs, err := service.Handle(ctx, "logs.list", []byte(`{"limit":10}`), nil)
	if err != nil {
		t.Fatalf("expected logs.list to succeed, got %v", err)
	}
	if len(logs.([]models.ActivityLogEntry)) == 0 {
		t.Fatalf("expected lock action to append a log entry")
	}
}

func TestServiceReportsFailedEC2ActionJob(t *testing.T) {
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")

	mustWriteFile(t, filepath.Join(home, ".aws", "config"), "[profile sandbox]\nregion = us-east-1\n")
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

	ec2Inventory := &stubEC2Inventory{
		regions: []string{"us-east-1"},
		instances: map[string][]models.AwsEc2Instance{
			"us-east-1": {
				{InstanceID: "i-0123456789abcdef0", Name: "sandbox-app", State: "running", InstanceType: "t3.small"},
			},
		},
		actionErrors: map[string]error{
			"stop": errors.New("simulated stop failure"),
		},
	}
	service := New(
		settings,
		dataStore,
		discovery.New(settings, func(command string) (string, error) {
			if command == "aws" {
				return "/usr/bin/aws", nil
			}
			return "", nil
		}),
		&stubS3Inventory{},
		ec2Inventory,
	)
	service.now = func() time.Time { return time.Date(2026, 4, 26, 10, 0, 0, 0, time.UTC) }

	ctx := context.Background()
	if _, err := service.Handle(ctx, "session.lock", nil, nil); err != nil {
		t.Fatalf("expected session.lock to succeed, got %v", err)
	}
	if _, err := service.Handle(ctx, "aws.ec2.selectInstance", []byte(`{"instanceId":"i-0123456789abcdef0"}`), nil); err != nil {
		t.Fatalf("expected aws.ec2.selectInstance to succeed, got %v", err)
	}

	notifier := recordingNotifier{events: make(chan models.JobStatus, 4)}
	result, err := service.Handle(ctx, "aws.ec2.invokeAction", []byte(`{"action":"stop"}`), notifier)
	if err != nil {
		t.Fatalf("expected aws.ec2.invokeAction to queue a job, got %v", err)
	}
	if result.(models.JobStatus).Status != "queued" {
		t.Fatalf("expected queued EC2 job, got %+v", result)
	}

	failedJob := waitForJobStatus(t, notifier.events, "failed")
	if !strings.Contains(failedJob.Message, "simulated stop failure") {
		t.Fatalf("expected failed job to include adapter error, got %+v", failedJob)
	}
	if len(ec2Inventory.actionRequests) != 1 || ec2Inventory.actionRequests[0] != "stop|us-east-1|i-0123456789abcdef0" {
		t.Fatalf("expected stop request to hit EC2 inventory, got %+v", ec2Inventory.actionRequests)
	}
}

func TestServiceRestoresLockedWorkspaceFromStore(t *testing.T) {
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")

	mustWriteFile(t, filepath.Join(home, ".aws", "config"), "[profile sandbox]\nregion = eu-west-2\n")
	mustWriteFile(t, filepath.Join(home, ".aws", "credentials"), "[sandbox]\naws_access_key_id = AKIAEXAMPLE\n")

	settings := config.FromEnv(map[string]string{}, "linux", home)
	if err := settings.EnsureRuntimeDirs(); err != nil {
		t.Fatalf("expected runtime dirs to be created, got %v", err)
	}

	firstStore, err := store.Open(settings.DatabasePath)
	if err != nil {
		t.Fatalf("expected sqlite store to open, got %v", err)
	}

	s3Inventory := &stubS3Inventory{
		buckets: []models.AwsS3Bucket{{Name: "cloudsprocket-artifacts"}},
		objects: map[string][]models.AwsS3Object{
			"cloudsprocket-artifacts": {
				{Key: "reports/daily.json", Size: "12 MB"},
			},
		},
		metadata: map[string][]models.DetailField{
			"cloudsprocket-artifacts|reports/daily.json": {
				{Label: "Bucket", Value: "cloudsprocket-artifacts"},
				{Label: "Key", Value: "reports/daily.json"},
			},
		},
	}
	ec2Inventory := &stubEC2Inventory{
		regions: []string{"eu-west-2"},
		instances: map[string][]models.AwsEc2Instance{
			"eu-west-2": {
				{InstanceID: "i-0123456789abcdef0", Name: "restored-app", State: "running", InstanceType: "t3.small"},
			},
		},
	}
	discoveryService := discovery.New(settings, func(command string) (string, error) {
		if command == "aws" {
			return "/usr/bin/aws", nil
		}
		return "", nil
	})
	firstService := New(settings, firstStore, discoveryService, s3Inventory, ec2Inventory)
	ctx := context.Background()

	if _, err := firstService.Handle(ctx, "session.lock", nil, nil); err != nil {
		t.Fatalf("expected session.lock to succeed, got %v", err)
	}
	if _, err := firstService.Handle(ctx, "aws.s3.selectBucket", []byte(`{"bucketName":"cloudsprocket-artifacts"}`), nil); err != nil {
		t.Fatalf("expected aws.s3.selectBucket to succeed, got %v", err)
	}
	if _, err := firstService.Handle(ctx, "aws.s3.setPrefixFilter", []byte(`{"prefix":"reports/"}`), nil); err != nil {
		t.Fatalf("expected aws.s3.setPrefixFilter to succeed, got %v", err)
	}
	if _, err := firstService.Handle(ctx, "aws.ec2.selectRegion", []byte(`{"region":"eu-west-2"}`), nil); err != nil {
		t.Fatalf("expected aws.ec2.selectRegion to succeed, got %v", err)
	}
	if err := firstStore.Close(); err != nil {
		t.Fatalf("expected first store to close, got %v", err)
	}

	secondStore, err := store.Open(settings.DatabasePath)
	if err != nil {
		t.Fatalf("expected sqlite store to reopen, got %v", err)
	}
	defer secondStore.Close()
	secondService := New(settings, secondStore, discoveryService, s3Inventory, ec2Inventory)

	sessionResult, err := secondService.Handle(ctx, "session.get", nil, nil)
	if err != nil {
		t.Fatalf("expected session.get to succeed after reopen, got %v", err)
	}
	session := sessionResult.(models.SessionSnapshot)
	if !session.IsLocked || session.LockedProfileID != "sandbox" || session.S3PrefixFilter != "reports/" || session.SelectedEC2Region != "eu-west-2" {
		t.Fatalf("expected locked session selections to be restored, got %+v", session)
	}

	workspaceResult, err := secondService.Handle(ctx, "workspace.get", nil, nil)
	if err != nil {
		t.Fatalf("expected workspace.get to succeed after reopen, got %v", err)
	}
	workspace := workspaceResult.(models.WorkspaceSnapshot)
	if workspace.SelectedS3BucketName != "cloudsprocket-artifacts" || workspace.S3PrefixFilter != "reports/" {
		t.Fatalf("expected restored S3 workspace state, got bucket=%q prefix=%q", workspace.SelectedS3BucketName, workspace.S3PrefixFilter)
	}
	if workspace.SelectedEC2Region != "eu-west-2" || len(workspace.EC2Instances) != 1 {
		t.Fatalf("expected restored EC2 workspace state, got region=%q instances=%+v", workspace.SelectedEC2Region, workspace.EC2Instances)
	}
}

func waitForJobStatus(t *testing.T, events <-chan models.JobStatus, status string) models.JobStatus {
	t.Helper()
	timeout := time.After(2 * time.Second)
	for {
		select {
		case job := <-events:
			if job.Status == status {
				return job
			}
		case <-timeout:
			t.Fatalf("timed out waiting for job status %s", status)
		}
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
