// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package aws

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

func TestClampPresignDuration(t *testing.T) {
	if got := ClampPresignDuration(0); got != 900 {
		t.Fatalf("default = %d", got)
	}
	if got := ClampPresignDuration(60); got != 60 {
		t.Fatalf("got %d", got)
	}
	const max = 7 * 24 * 60 * 60
	if got := ClampPresignDuration(max + 1); got != max {
		t.Fatalf("cap = %d", got)
	}
}

func TestEC2DesiredState(t *testing.T) {
	if EC2DesiredState("start") != "running" {
		t.Fatal(EC2DesiredState("start"))
	}
	if EC2DesiredState("stop") != "stopped" {
		t.Fatal(EC2DesiredState("stop"))
	}
	if EC2DesiredState("terminate") != "" {
		t.Fatal("terminate has no desired state")
	}
}

func TestSelectedEC2State(t *testing.T) {
	instances := []models.AwsEc2Instance{{InstanceID: "i-1", State: "running"}}
	if SelectedEC2State(instances, "i-1") != "running" {
		t.Fatal(SelectedEC2State(instances, "i-1"))
	}
	if SelectedEC2State(instances, "missing") != "" {
		t.Fatal("expected empty")
	}
}

func TestActiveEC2Selection(t *testing.T) {
	snap := discovery.Snapshot{Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}}}
	session := models.SessionSnapshot{
		IsLocked: true, CurrentProviderID: "aws", SelectedProfileID: "p1",
		SelectedEC2Region: "eu-west-1", SelectedEC2InstanceID: "i-abc",
	}
	profile, region, id, err := ActiveEC2Selection(snap, session, "")
	if err != nil {
		t.Fatal(err)
	}
	if profile.ProfileID != "p1" || region != "eu-west-1" || id != "i-abc" {
		t.Fatalf("got %s %s %s", profile.ProfileID, region, id)
	}
	_, _, id, err = ActiveEC2Selection(snap, session, "i-override")
	if err != nil || id != "i-override" {
		t.Fatalf("override id=%s err=%v", id, err)
	}
}

func TestActiveRDSSelectionRequiresInstance(t *testing.T) {
	snap := discovery.Snapshot{Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}}}
	session := models.SessionSnapshot{
		IsLocked: true, CurrentProviderID: "aws", SelectedProfileID: "p1", SelectedRDSRegion: "us-east-1",
	}
	_, _, _, err := ActiveRDSSelection(snap, session, "")
	if err == nil {
		t.Fatal("expected missing instance error")
	}
}

func TestValidateS3UploadRequest(t *testing.T) {
	if err := ValidateS3UploadRequest("", "k"); err == nil {
		t.Fatal("expected empty path error")
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "file.txt")
	if err := os.WriteFile(path, []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := ValidateS3UploadRequest(path, "../bad"); err == nil {
		t.Fatal("expected path segment error")
	}
	if err := ValidateS3UploadRequest(path, "ok/key.txt"); err != nil {
		t.Fatal(err)
	}
}

type recordingActivity struct {
	mu   sync.Mutex
	jobs []models.JobStatus
}

func (a *recordingActivity) Timestamp() string { return "ts" }
func (a *recordingActivity) NotifyStateAndLog(context.Context, discovery.Snapshot, models.SessionSnapshot, sessionport.Notifier, string, string) error {
	return nil
}
func (a *recordingActivity) NotifyJob(_ sessionport.Notifier, job models.JobStatus) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.jobs = append(a.jobs, job)
}
func (a *recordingActivity) AppendActivity(context.Context, sessionport.Notifier, string, string) error {
	return nil
}
func (a *recordingActivity) lastStatus() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	if len(a.jobs) == 0 {
		return ""
	}
	return a.jobs[len(a.jobs)-1].Status
}

func (a *recordingActivity) lastKind() models.JobKind {
	a.mu.Lock()
	defer a.mu.Unlock()
	if len(a.jobs) == 0 {
		return ""
	}
	return a.jobs[len(a.jobs)-1].Kind
}

type fakeEC2Lifecycle struct {
	started    bool
	stopped    bool
	rebooted   bool
	terminated bool
	instances  []models.AwsEc2Instance
}

func (f *fakeEC2Lifecycle) StartInstance(context.Context, models.ProfileSummary, string, string) error {
	f.started = true
	return nil
}
func (f *fakeEC2Lifecycle) StopInstance(context.Context, models.ProfileSummary, string, string) error {
	f.stopped = true
	return nil
}
func (f *fakeEC2Lifecycle) RebootInstance(context.Context, models.ProfileSummary, string, string) error {
	f.rebooted = true
	return nil
}
func (f *fakeEC2Lifecycle) TerminateInstances(context.Context, models.ProfileSummary, string, string) error {
	f.terminated = true
	return nil
}
func (f *fakeEC2Lifecycle) ListInstances(context.Context, models.ProfileSummary, string) ([]models.AwsEc2Instance, error) {
	return f.instances, nil
}

func TestHandleEC2InvokeActionQueuesJob(t *testing.T) {
	ec2 := &fakeEC2Lifecycle{
		instances: []models.AwsEc2Instance{{InstanceID: "i-1", State: "running"}},
	}
	act := &recordingActivity{}
	sess := &fakeSession{session: models.SessionSnapshot{
		IsLocked: true, CurrentProviderID: "aws", SelectedProfileID: "p1",
		AWSWriteModeEnabled: true, SelectedEC2Region: "us-east-1", SelectedEC2InstanceID: "i-1",
	}}
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: discovery.Snapshot{
			Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}},
		}},
		Session: sess, Workspace: &fakeWorkspace{}, Activity: act, Invalidator: &fakeInvalidator{},
		EC2Lifecycle: ec2,
		Now:          func() time.Time { return time.Unix(1, 0).UTC() },
	})
	params, _ := json.Marshal(map[string]string{"action": "reboot", "instanceId": "i-1"})
	result, err := svc.HandleEC2InvokeAction(context.Background(), params, nil)
	if err != nil {
		t.Fatal(err)
	}
	job, ok := result.(models.JobStatus)
	if !ok || job.Status != "queued" {
		t.Fatalf("result = %+v", result)
	}
	if job.Kind != models.JobKindEC2Action {
		t.Fatalf("kind = %q", job.Kind)
	}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if act.lastStatus() == "completed" {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if act.lastStatus() != "completed" {
		t.Fatalf("last status = %q jobs=%+v", act.lastStatus(), act.jobs)
	}
	if act.lastKind() != models.JobKindEC2Action {
		t.Fatalf("completed kind = %q", act.lastKind())
	}
	if !ec2.rebooted {
		t.Fatal("expected reboot")
	}
	if sess.session.SelectedEC2InstanceID != "i-1" {
		t.Fatalf("session instance = %q", sess.session.SelectedEC2InstanceID)
	}
}

func TestHandleS3LoadMoreObjects(t *testing.T) {
	s3 := &fakeS3{}
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: discovery.Snapshot{
			Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}},
		}},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked: true, CurrentProviderID: "aws", SelectedProfileID: "p1", SelectedS3BucketName: "b",
		}},
		Workspace: &fakeWorkspace{}, S3: s3,
	})
	params, _ := json.Marshal(map[string]string{"continuationToken": "tok"})
	result, err := svc.HandleS3LoadMoreObjects(context.Background(), params, nil)
	if err != nil {
		t.Fatal(err)
	}
	ws, ok := result.(models.WorkspaceSnapshot)
	if !ok || len(ws.S3Objects) != 1 {
		t.Fatalf("result = %+v", result)
	}
	if !s3.listed {
		t.Fatal("expected ListObjects")
	}
}

func TestHandleS3PresignObjectQueuesJob(t *testing.T) {
	s3 := &fakeS3{}
	act := &recordingActivity{}
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: discovery.Snapshot{
			Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}},
		}},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked: true, CurrentProviderID: "aws", SelectedProfileID: "p1",
			SelectedS3BucketName: "b", SelectedS3ObjectKey: "k",
		}},
		Activity: act, S3: s3,
		Now: func() time.Time { return time.Unix(2, 0).UTC() },
	})
	params, _ := json.Marshal(map[string]int{"durationSeconds": 3600})
	result, err := svc.HandleS3PresignObject(context.Background(), params, nil)
	if err != nil {
		t.Fatal(err)
	}
	job, ok := result.(models.JobStatus)
	if !ok || job.Status != "queued" {
		t.Fatalf("result = %+v", result)
	}
	if job.Kind != models.JobKindS3Presign {
		t.Fatalf("kind = %q", job.Kind)
	}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if act.lastStatus() == "completed" {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !s3.presigned || act.lastStatus() != "completed" {
		t.Fatalf("presigned=%v status=%q", s3.presigned, act.lastStatus())
	}
	if got := act.lastKind(); got != models.JobKindS3Presign {
		t.Fatalf("completed kind = %q", got)
	}
}

func TestHandleS3ValidateUrlQueuesJob(t *testing.T) {
	act := &recordingActivity{}
	svc := New(Deps{
		Activity: act,
		Now:      func() time.Time { return time.Unix(3, 0).UTC() },
	})
	params, _ := json.Marshal(map[string]string{"url": "https://example.com"})
	result, err := svc.HandleS3ValidateUrl(params, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.(models.JobStatus).Status != "queued" {
		t.Fatalf("result = %+v", result)
	}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if status := act.lastStatus(); status == "completed" || status == "failed" {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("job did not finish; jobs=%+v", act.jobs)
}
