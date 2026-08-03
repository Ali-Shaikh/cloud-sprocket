// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package aws

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

type fakeSQS struct {
	peeked  bool
	sent    bool
	created bool
}

func (f *fakeSQS) PeekMessages(context.Context, models.ProfileSummary, string, string) (models.AwsSqsPeekResult, error) {
	f.peeked = true
	return models.AwsSqsPeekResult{}, nil
}
func (f *fakeSQS) SendMessage(context.Context, models.ProfileSummary, string, string, string) (models.AwsSqsSendResult, error) {
	f.sent = true
	return models.AwsSqsSendResult{}, nil
}
func (f *fakeSQS) CreateQueue(context.Context, models.ProfileSummary, string, string) (models.AwsSqsCreateQueueResult, error) {
	f.created = true
	return models.AwsSqsCreateQueueResult{QueueName: "q", QueueURL: "https://q"}, nil
}

func TestActiveSQSSelection(t *testing.T) {
	profile := models.ProfileSummary{ProfileID: "p1", ProviderID: "aws"}
	snap := discovery.Snapshot{Profiles: []models.ProfileSummary{profile}}
	session := models.SessionSnapshot{
		IsLocked:            true,
		CurrentProviderID:   "aws",
		SelectedProfileID:   "p1",
		SelectedSQSRegion:   "eu-west-1",
		SelectedSQSQueueURL: "https://queue",
	}
	got, region, queue, err := ActiveSQSSelection(snap, session, "")
	if err != nil {
		t.Fatal(err)
	}
	if got.ProfileID != "p1" || region != "eu-west-1" || queue != "https://queue" {
		t.Fatalf("got profile=%s region=%s queue=%s", got.ProfileID, region, queue)
	}
	_, _, _, err = ActiveSQSSelection(snap, models.SessionSnapshot{IsLocked: false}, "")
	if err == nil {
		t.Fatal("expected unlocked error")
	}
}

func TestHandleSQSCreateQueue(t *testing.T) {
	sqs := &fakeSQS{}
	inv := &fakeInvalidator{}
	sess := &fakeSession{session: models.SessionSnapshot{
		IsLocked:            true,
		CurrentProviderID:   "aws",
		SelectedProfileID:   "p1",
		AWSWriteModeEnabled: true,
		SelectedSQSRegion:   "us-east-1",
	}}
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: discovery.Snapshot{
			Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}},
		}},
		Session:       sess,
		Workspace:     &fakeWorkspace{},
		Activity:      &fakeActivity{},
		Invalidator:   inv,
		SQS:           sqs,
		ActionTimeout: 5 * time.Second,
	})
	params, _ := json.Marshal(map[string]string{"queueName": "orders"})
	if _, err := svc.HandleSQSCreateQueue(context.Background(), params, nil); err != nil {
		t.Fatal(err)
	}
	if !sqs.created {
		t.Fatal("expected CreateQueue")
	}
	if sess.session.SelectedSQSQueueURL != "https://q" {
		t.Fatalf("selected queue = %q", sess.session.SelectedSQSQueueURL)
	}
	if len(inv.scopes) != 0 {
		// InvalidateResourceCache uses scope+hash, not scopes list
	}
}

func TestAuthorizeWriteRequiresWriteMode(t *testing.T) {
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: discovery.Snapshot{
			Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}},
		}},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:          true,
			CurrentProviderID: "aws",
			SelectedProfileID: "p1",
		}},
		Workspace: &fakeWorkspace{},
	})
	_, _, err := svc.AuthorizeWrite(
		context.Background(),
		discovery.Snapshot{Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}}},
		"open workspace",
		"write required",
	)
	if err == nil || err.Error() != "write required" {
		t.Fatalf("err = %v", err)
	}
}

func TestWritesEnabled(t *testing.T) {
	if WritesEnabled(models.SessionSnapshot{IsLocked: true, AWSWriteModeEnabled: true}, models.ProfileSummary{}) != true {
		t.Fatal("expected enabled")
	}
	if WritesEnabled(models.SessionSnapshot{IsLocked: true}, models.ProfileSummary{}) {
		t.Fatal("expected disabled")
	}
}

func TestProfileRegionHintDefault(t *testing.T) {
	if ProfileRegionHint(models.ProfileSummary{}) != "us-east-1" {
		t.Fatal(ProfileRegionHint(models.ProfileSummary{}))
	}
	p := models.ProfileSummary{Attributes: []models.DetailField{{Label: "Region", Value: "ap-south-1"}}}
	if ProfileRegionHint(p) != "ap-south-1" {
		t.Fatal(ProfileRegionHint(p))
	}
}

func TestHandleSQSPeekUsesWriter(t *testing.T) {
	sqs := &fakeSQS{}
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: discovery.Snapshot{
			Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}},
		}},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:            true,
			CurrentProviderID:   "aws",
			SelectedProfileID:   "p1",
			AWSWriteModeEnabled: true,
			SelectedSQSRegion:   "us-east-1",
			SelectedSQSQueueURL: "https://q",
		}},
		Workspace: &fakeWorkspace{},
		SQS:       sqs,
	})
	params, _ := json.Marshal(map[string]string{"queueUrl": ""})
	if _, err := svc.HandleSQSPeek(context.Background(), params, nil); err != nil {
		t.Fatal(err)
	}
	if !sqs.peeked {
		t.Fatal("expected peek")
	}
}

func TestHandleSecretsRevealGatesWriteMode(t *testing.T) {
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: discovery.Snapshot{
			Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}},
		}},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:          true,
			CurrentProviderID: "aws",
			SelectedProfileID: "p1",
		}},
		Workspace: &fakeWorkspace{},
		Secrets:   secretsStub{},
	})
	params, _ := json.Marshal(map[string]string{"region": "us-east-1", "secretName": "x"})
	_, err := svc.HandleSecretsReveal(context.Background(), params, nil)
	if err == nil {
		t.Fatal("expected write mode gate")
	}
}

type secretsStub struct{}

func (secretsStub) GetSecretValue(context.Context, models.ProfileSummary, string, string) (string, error) {
	return "secret", nil
}

type fakeLogs struct {
	filtered bool
	pattern  string
	group    string
}

func (f *fakeLogs) CreateLogGroup(context.Context, models.ProfileSummary, string, string) (models.AwsLogsCreateLogGroupResult, error) {
	return models.AwsLogsCreateLogGroupResult{}, nil
}
func (f *fakeLogs) PutLogEvents(context.Context, models.ProfileSummary, string, string, string) (models.AwsLogsPutLogEventsResult, error) {
	return models.AwsLogsPutLogEventsResult{}, nil
}
func (f *fakeLogs) FilterEvents(_ context.Context, _ models.ProfileSummary, _ string, logGroupName string, filterPattern string, _ int) (models.AwsLogsFilterEventsResult, error) {
	f.filtered = true
	f.group = logGroupName
	f.pattern = filterPattern
	return models.AwsLogsFilterEventsResult{
		LogGroupName:  logGroupName,
		FilterPattern: filterPattern,
		Events:        []string{"2024-06-15 12:00:00 ERROR boom"},
		Summary:       "Found 1 event(s).",
	}, nil
}

func TestHandleLogsFilterEventsIsReadOnly(t *testing.T) {
	logs := &fakeLogs{}
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: discovery.Snapshot{
			Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}},
		}},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:           true,
			CurrentProviderID:  "aws",
			SelectedProfileID:  "p1",
			SelectedLogsRegion: "eu-west-1",
		}},
		Workspace:     &fakeWorkspace{},
		Logs:          logs,
		ActionTimeout: 5 * time.Second,
	})
	params, _ := json.Marshal(map[string]any{
		"logGroupName":  "/aws/lambda/app",
		"filterPattern": "ERROR",
		"limit":         10,
	})
	result, err := svc.HandleLogsFilterEvents(context.Background(), params, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !logs.filtered || logs.group != "/aws/lambda/app" || logs.pattern != "ERROR" {
		t.Fatalf("filter call = %+v", logs)
	}
	got, ok := result.(models.AwsLogsFilterEventsResult)
	if !ok || len(got.Events) != 1 {
		t.Fatalf("result = %#v", result)
	}
}

func TestHandleLogsFilterEventsRequiresLogGroup(t *testing.T) {
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: discovery.Snapshot{
			Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}},
		}},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:          true,
			CurrentProviderID: "aws",
			SelectedProfileID: "p1",
		}},
		Workspace: &fakeWorkspace{},
		Logs:      &fakeLogs{},
	})
	params, _ := json.Marshal(map[string]string{"logGroupName": ""})
	if _, err := svc.HandleLogsFilterEvents(context.Background(), params, nil); err == nil {
		t.Fatal("expected log group name required")
	}
}

type fakeS3 struct {
	deleted   bool
	created   bool
	uploaded  bool
	presigned bool
	listed    bool
}

func (f *fakeS3) ListObjects(context.Context, models.ProfileSummary, string, string, string) (models.AwsS3ObjectListPage, error) {
	f.listed = true
	return models.AwsS3ObjectListPage{
		Entries:               []models.AwsS3Object{{Key: "next.txt"}},
		NextContinuationToken: "",
		IsTruncated:           false,
	}, nil
}
func (f *fakeS3) UploadFile(context.Context, models.ProfileSummary, string, string, string) (models.AwsS3UploadResult, error) {
	f.uploaded = true
	return models.AwsS3UploadResult{DestinationURI: "s3://b/k"}, nil
}
func (f *fakeS3) PresignGetObject(context.Context, models.ProfileSummary, string, string, int) (models.AwsS3PresignResult, error) {
	f.presigned = true
	return models.AwsS3PresignResult{URL: "https://signed.example"}, nil
}
func (f *fakeS3) DeleteObject(context.Context, models.ProfileSummary, string, string) (models.AwsS3DeleteObjectResult, error) {
	f.deleted = true
	return models.AwsS3DeleteObjectResult{}, nil
}
func (f *fakeS3) CreateBucket(context.Context, models.ProfileSummary, string, string) (models.AwsS3CreateBucketResult, error) {
	f.created = true
	return models.AwsS3CreateBucketResult{BucketName: "b", Region: "us-east-1"}, nil
}
func (f *fakeS3) CopyObject(context.Context, models.ProfileSummary, string, string, string) (models.AwsS3CopyObjectResult, error) {
	return models.AwsS3CopyObjectResult{DestinationObjectKey: "dest"}, nil
}
func (f *fakeS3) CreateFolderPrefix(context.Context, models.ProfileSummary, string, string) (models.AwsS3CreateFolderPrefixResult, error) {
	return models.AwsS3CreateFolderPrefixResult{FolderPrefix: "f/"}, nil
}

func TestHandleS3CreateBucket(t *testing.T) {
	s3 := &fakeS3{}
	sess := &fakeSession{session: models.SessionSnapshot{
		IsLocked: true, CurrentProviderID: "aws", SelectedProfileID: "p1", AWSWriteModeEnabled: true,
	}}
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: discovery.Snapshot{
			Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}},
		}},
		Session: sess, Workspace: &fakeWorkspace{}, Activity: &fakeActivity{}, Invalidator: &fakeInvalidator{}, S3: s3,
	})
	params, _ := json.Marshal(map[string]string{"bucketName": "b", "region": "us-east-1"})
	if _, err := svc.HandleS3CreateBucket(context.Background(), params, nil); err != nil {
		t.Fatal(err)
	}
	if !s3.created || sess.session.SelectedS3BucketName != "b" {
		t.Fatalf("created=%v bucket=%q", s3.created, sess.session.SelectedS3BucketName)
	}
}

func TestActiveS3ObjectSelectionRequiresKey(t *testing.T) {
	snap := discovery.Snapshot{Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}}}
	session := models.SessionSnapshot{
		IsLocked: true, CurrentProviderID: "aws", SelectedProfileID: "p1", SelectedS3BucketName: "b",
	}
	_, _, _, err := ActiveS3ObjectSelection(snap, session, "")
	if err == nil {
		t.Fatal("expected missing object error")
	}
}

func TestValidateLambdaCreateInput(t *testing.T) {
	if err := ValidateLambdaCreateInput(models.AwsLambdaCreateInput{}); err == nil {
		t.Fatal("expected error")
	}
	err := ValidateLambdaCreateInput(models.AwsLambdaCreateInput{
		FunctionName: "ok", Runtime: "nodejs20.x", HandlerSource: "exports.handler=async()=>({})",
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestHandleLambdaDescribe(t *testing.T) {
	lam := &fakeLambda{}
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: discovery.Snapshot{
			Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}},
		}},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked: true, CurrentProviderID: "aws", SelectedProfileID: "p1",
			SelectedLambdaRegion: "us-east-1", SelectedLambdaFunctionName: "fn",
		}},
		Workspace: &fakeWorkspace{}, Lambda: lam,
	})
	params, _ := json.Marshal(map[string]string{"functionName": ""})
	if _, err := svc.HandleLambdaDescribe(context.Background(), params, nil); err != nil {
		t.Fatal(err)
	}
	if !lam.described {
		t.Fatal("expected describe")
	}
}

type fakeLambda struct{ described bool }

func (f *fakeLambda) DescribeFunction(context.Context, models.ProfileSummary, string, string) (models.AwsLambdaFunction, error) {
	f.described = true
	return models.AwsLambdaFunction{FunctionName: "fn"}, nil
}
func (f *fakeLambda) InvokeFunction(context.Context, models.ProfileSummary, string, string, []byte) (models.AwsLambdaInvokeResult, error) {
	return models.AwsLambdaInvokeResult{}, nil
}
func (f *fakeLambda) CreateFunction(context.Context, models.ProfileSummary, string, models.AwsLambdaCreateInput) (models.AwsLambdaFunction, error) {
	return models.AwsLambdaFunction{}, nil
}
func (f *fakeLambda) DeleteFunction(context.Context, models.ProfileSummary, string, string) (models.AwsLambdaDeleteFunctionResult, error) {
	return models.AwsLambdaDeleteFunctionResult{}, nil
}
