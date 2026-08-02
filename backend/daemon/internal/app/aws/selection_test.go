// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package aws

import (
	"context"
	"encoding/json"
	"sync"
	"testing"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

type fakeDiscovery struct {
	snapshot discovery.Snapshot
	err      error
}

func (f fakeDiscovery) Discover() (discovery.Snapshot, error) {
	return f.snapshot, f.err
}

type fakeSession struct {
	mu      sync.Mutex
	session models.SessionSnapshot
}

func (f *fakeSession) Load(_ context.Context, _ discovery.Snapshot) (models.SessionSnapshot, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.session, nil
}

func (f *fakeSession) Update(_ context.Context, _ discovery.Snapshot, mutate func(*models.SessionSnapshot) error) (models.SessionSnapshot, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if mutate != nil {
		if err := mutate(&f.session); err != nil {
			return models.SessionSnapshot{}, err
		}
	}
	return f.session, nil
}

type fakeWorkspace struct {
	lastOpts sessionport.SnapshotOptions
	built    int
}

func (f *fakeWorkspace) Build(_ context.Context, _ discovery.Snapshot, _ models.SessionSnapshot, opts sessionport.SnapshotOptions) models.WorkspaceSnapshot {
	f.built++
	f.lastOpts = opts
	return models.WorkspaceSnapshot{SelectedS3BucketName: "built"}
}

type fakeActivity struct {
	notified int
}

func (f *fakeActivity) Timestamp() string { return "ts" }
func (f *fakeActivity) NotifyStateAndLog(context.Context, discovery.Snapshot, models.SessionSnapshot, sessionport.Notifier, string, string) error {
	f.notified++
	return nil
}
func (f *fakeActivity) NotifyJob(sessionport.Notifier, models.JobStatus) {}
func (f *fakeActivity) AppendActivity(context.Context, sessionport.Notifier, string, string) error {
	return nil
}

type fakeInvalidator struct {
	scopes []string
}

func (f *fakeInvalidator) InvalidateRuntimeStatus()                                {}
func (f *fakeInvalidator) InvalidateAzureCLIExtensionCache()                       {}
func (f *fakeInvalidator) InvalidateCloudResourceCaches(context.Context)           {}
func (f *fakeInvalidator) InvalidateResourceCache(context.Context, string, string) {}
func (f *fakeInvalidator) InvalidateResourceCacheScope(_ context.Context, scope string) {
	f.scopes = append(f.scopes, scope)
}

func TestHandleS3SelectBucketMutatesSessionAndInvalidatesCache(t *testing.T) {
	sess := &fakeSession{session: models.SessionSnapshot{
		IsLocked:             true,
		CurrentProviderID:    "aws",
		SelectedS3BucketName: "old",
		SelectedS3ObjectKey:  "obj",
		S3PrefixFilter:       "folder/",
	}}
	ws := &fakeWorkspace{}
	inv := &fakeInvalidator{}
	act := &fakeActivity{}
	svc := New(Deps{
		Discovery:   fakeDiscovery{},
		Session:     sess,
		Workspace:   ws,
		Activity:    act,
		Invalidator: inv,
	})

	params, _ := json.Marshal(map[string]string{"bucketName": "new-bucket"})
	result, err := svc.HandleS3SelectBucket(context.Background(), params, nil)
	if err != nil {
		t.Fatalf("HandleS3SelectBucket: %v", err)
	}
	if _, ok := result.(models.WorkspaceSnapshot); !ok {
		t.Fatalf("expected WorkspaceSnapshot, got %T", result)
	}
	if sess.session.SelectedS3BucketName != "new-bucket" {
		t.Fatalf("bucket = %q", sess.session.SelectedS3BucketName)
	}
	if sess.session.SelectedS3ObjectKey != "" || sess.session.S3PrefixFilter != "" {
		t.Fatalf("expected object and prefix cleared, got key=%q prefix=%q", sess.session.SelectedS3ObjectKey, sess.session.S3PrefixFilter)
	}
	if len(inv.scopes) != 1 || inv.scopes[0] != "aws.s3.objects.page" {
		t.Fatalf("invalidator scopes = %#v", inv.scopes)
	}
	if ws.lastOpts.AWSScope != "s3" || !ws.lastOpts.SkipAzureInventory {
		t.Fatalf("workspace opts = %+v", ws.lastOpts)
	}
	if act.notified != 1 {
		t.Fatalf("expected NotifyStateAndLog once, got %d", act.notified)
	}
}

func TestWithLockedAWSWorkspaceRejectsUnlocked(t *testing.T) {
	svc := New(Deps{
		Discovery: fakeDiscovery{},
		Session:   &fakeSession{session: models.SessionSnapshot{IsLocked: false}},
		Workspace: &fakeWorkspace{},
	})
	_, _, err := svc.withLockedAWSWorkspace(context.Background(), "open an AWS workspace first", nil)
	if err == nil || err.Error() != "open an AWS workspace first" {
		t.Fatalf("err = %v", err)
	}
}

func TestHandleEC2SelectRegionOmitsAWSScope(t *testing.T) {
	ws := &fakeWorkspace{}
	svc := New(Deps{
		Discovery: fakeDiscovery{},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:          true,
			CurrentProviderID: "aws",
		}},
		Workspace: ws,
		Activity:  &fakeActivity{},
	})
	params, _ := json.Marshal(map[string]string{"region": "eu-west-1"})
	if _, err := svc.HandleEC2SelectRegion(context.Background(), params, nil); err != nil {
		t.Fatalf("HandleEC2SelectRegion: %v", err)
	}
	if ws.lastOpts.AWSScope != "" {
		t.Fatalf("EC2 must omit AWSScope, got %q", ws.lastOpts.AWSScope)
	}
	if !ws.lastOpts.SkipAzureInventory {
		t.Fatal("expected SkipAzureInventory")
	}
}

func TestHandleS3SelectObjectRequiresBucket(t *testing.T) {
	svc := New(Deps{
		Discovery: fakeDiscovery{},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:          true,
			CurrentProviderID: "aws",
		}},
		Workspace: &fakeWorkspace{},
	})
	params, _ := json.Marshal(map[string]string{"objectKey": "a.txt"})
	_, err := svc.HandleS3SelectObject(context.Background(), params, nil)
	if err == nil || err.Error() != "select an S3 bucket before selecting an object" {
		t.Fatalf("err = %v", err)
	}
}
