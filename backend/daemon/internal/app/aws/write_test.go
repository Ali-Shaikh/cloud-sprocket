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

type fakeSNS struct {
	subscribed bool
	protocol   string
	endpoint   string
}

func (f *fakeSNS) Publish(context.Context, models.ProfileSummary, string, string, string) (models.AwsSnsPublishResult, error) {
	return models.AwsSnsPublishResult{Summary: "published"}, nil
}
func (f *fakeSNS) CreateTopic(context.Context, models.ProfileSummary, string, string) (models.AwsSnsCreateTopicResult, error) {
	return models.AwsSnsCreateTopicResult{TopicName: "t", TopicArn: "arn:aws:sns:us-east-1:1:t"}, nil
}
func (f *fakeSNS) CreateSubscription(_ context.Context, _ models.ProfileSummary, _ string, topicArn, protocol, endpoint string) (models.AwsSnsCreateSubscriptionResult, error) {
	f.subscribed = true
	f.protocol = protocol
	f.endpoint = endpoint
	return models.AwsSnsCreateSubscriptionResult{
		TopicArn:        topicArn,
		Protocol:        protocol,
		Endpoint:        endpoint,
		SubscriptionArn: topicArn + ":sub-1",
		Summary:         "Created SNS subscription.",
	}, nil
}

func TestHandleSNSCreateSubscription(t *testing.T) {
	sns := &fakeSNS{}
	sess := &fakeSession{session: models.SessionSnapshot{
		IsLocked:            true,
		CurrentProviderID:   "aws",
		SelectedProfileID:   "p1",
		AWSWriteModeEnabled: true,
		SelectedSNSRegion:   "us-east-1",
		SelectedSNSTopicArn: "arn:aws:sns:us-east-1:1:orders",
	}}
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: discovery.Snapshot{
			Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}},
		}},
		Session:     sess,
		Workspace:   &fakeWorkspace{},
		Activity:    &fakeActivity{},
		Invalidator: &fakeInvalidator{},
		SNS:         sns,
	})
	params, _ := json.Marshal(map[string]string{
		"protocol": "sqs",
		"endpoint": "arn:aws:sqs:us-east-1:1:orders-q",
	})
	if _, err := svc.HandleSNSCreateSubscription(context.Background(), params, nil); err != nil {
		t.Fatal(err)
	}
	if !sns.subscribed || sns.protocol != "sqs" || sns.endpoint != "arn:aws:sqs:us-east-1:1:orders-q" {
		t.Fatalf("subscribe = %+v", sns)
	}
}

func TestHandleSNSCreateSubscriptionRequiresWriteMode(t *testing.T) {
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: discovery.Snapshot{
			Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}},
		}},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:            true,
			CurrentProviderID:   "aws",
			SelectedProfileID:   "p1",
			AWSWriteModeEnabled: false,
			SelectedSNSRegion:   "us-east-1",
			SelectedSNSTopicArn: "arn:aws:sns:us-east-1:1:orders",
		}},
		Workspace: &fakeWorkspace{},
		SNS:       &fakeSNS{},
	})
	params, _ := json.Marshal(map[string]string{
		"protocol": "sqs",
		"endpoint": "arn:aws:sqs:us-east-1:1:orders-q",
	})
	if _, err := svc.HandleSNSCreateSubscription(context.Background(), params, nil); err == nil {
		t.Fatal("expected write mode error")
	}
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

type fakeECS struct {
	forced bool
	region string
	cluster string
	service string
}

func (f *fakeECS) ForceNewDeployment(_ context.Context, _ models.ProfileSummary, region string, clusterArn string, serviceArn string) (models.AwsEcsForceNewDeploymentResult, error) {
	f.forced = true
	f.region = region
	f.cluster = clusterArn
	f.service = serviceArn
	return models.AwsEcsForceNewDeploymentResult{
		ClusterArn:  clusterArn,
		ServiceArn:  serviceArn,
		ServiceName: "web",
		Region:      region,
		Summary:     "Forced a new deployment for ECS service web.",
	}, nil
}

func TestHandleECSForceNewDeployment(t *testing.T) {
	ecs := &fakeECS{}
	inv := &fakeInvalidator{}
	sess := &fakeSession{session: models.SessionSnapshot{
		IsLocked:              true,
		CurrentProviderID:     "aws",
		SelectedProfileID:     "p1",
		AWSWriteModeEnabled:   true,
		SelectedECSRegion:     "eu-west-1",
		SelectedECSClusterArn: "arn:aws:ecs:eu-west-1:123:cluster/demo",
		SelectedECSServiceArn: "arn:aws:ecs:eu-west-1:123:service/demo/web",
	}}
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: discovery.Snapshot{
			Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}},
		}},
		Session:       sess,
		Workspace:     &fakeWorkspace{},
		Activity:      &fakeActivity{},
		Invalidator:   inv,
		ECS:           ecs,
		ActionTimeout: 5 * time.Second,
	})
	params, _ := json.Marshal(map[string]string{})
	if _, err := svc.HandleECSForceNewDeployment(context.Background(), params, nil); err != nil {
		t.Fatal(err)
	}
	if !ecs.forced || ecs.region != "eu-west-1" || ecs.service != "arn:aws:ecs:eu-west-1:123:service/demo/web" {
		t.Fatalf("force call = %+v", ecs)
	}
}

func TestHandleECSForceNewDeploymentRequiresWriteMode(t *testing.T) {
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: discovery.Snapshot{
			Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}},
		}},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:              true,
			CurrentProviderID:     "aws",
			SelectedProfileID:     "p1",
			SelectedECSRegion:     "eu-west-1",
			SelectedECSClusterArn: "arn:aws:ecs:eu-west-1:123:cluster/demo",
			SelectedECSServiceArn: "arn:aws:ecs:eu-west-1:123:service/demo/web",
		}},
		Workspace: &fakeWorkspace{},
		ECS:       &fakeECS{},
	})
	params, _ := json.Marshal(map[string]string{})
	if _, err := svc.HandleECSForceNewDeployment(context.Background(), params, nil); err == nil {
		t.Fatal("expected write mode gate")
	}
}

func TestActiveECSServiceSelection(t *testing.T) {
	profile := models.ProfileSummary{ProfileID: "p1", ProviderID: "aws"}
	snap := discovery.Snapshot{Profiles: []models.ProfileSummary{profile}}
	session := models.SessionSnapshot{
		IsLocked:              true,
		CurrentProviderID:     "aws",
		SelectedProfileID:     "p1",
		SelectedECSRegion:     "us-east-1",
		SelectedECSClusterArn: "arn:cluster",
		SelectedECSServiceArn: "arn:service",
	}
	got, region, cluster, service, err := ActiveECSServiceSelection(snap, session, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if got.ProfileID != "p1" || region != "us-east-1" || cluster != "arn:cluster" || service != "arn:service" {
		t.Fatalf("got profile=%s region=%s cluster=%s service=%s", got.ProfileID, region, cluster, service)
	}
	_, _, _, _, err = ActiveECSServiceSelection(snap, models.SessionSnapshot{IsLocked: false}, "", "")
	if err == nil {
		t.Fatal("expected unlocked error")
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

type fakeDynamoDB struct {
	scanned bool
	token   string
}

func (f *fakeDynamoDB) PutItem(context.Context, models.ProfileSummary, string, string, string) (models.AwsDynamoDBWriteResult, error) {
	return models.AwsDynamoDBWriteResult{}, nil
}
func (f *fakeDynamoDB) DeleteItem(context.Context, models.ProfileSummary, string, string, string) (models.AwsDynamoDBWriteResult, error) {
	return models.AwsDynamoDBWriteResult{}, nil
}
func (f *fakeDynamoDB) ScanSampleItems(_ context.Context, _ models.ProfileSummary, _ string, _ string, token string, _ int32) (models.AwsDynamoDBScanPage, error) {
	f.scanned = true
	f.token = token
	return models.AwsDynamoDBScanPage{
		Items:                []string{`{"id":"page-2"}`},
		SampleItemsNextToken: "next-token",
		SampleItemsHasMore:   true,
	}, nil
}

func TestHandleDynamoDBLoadMoreItems(t *testing.T) {
	ddb := &fakeDynamoDB{}
	ws := &fakeWorkspace{
		snapshot: models.WorkspaceSnapshot{
			DynamoDBTables: []models.AwsDynamoDBTable{
				{
					TableName:   "orders",
					SampleItems: []string{`{"id":"page-1"}`},
				},
			},
		},
	}
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: discovery.Snapshot{
			Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}},
		}},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:                  true,
			CurrentProviderID:         "aws",
			SelectedProfileID:         "p1",
			SelectedDynamoDBRegion:    "us-east-1",
			SelectedDynamoDBTableName: "orders",
		}},
		Workspace:     ws,
		DynamoDB:      ddb,
		ActionTimeout: 5 * time.Second,
	})
	params, _ := json.Marshal(map[string]string{
		"tableName":         "orders",
		"continuationToken": "page-token",
	})
	result, err := svc.HandleDynamoDBLoadMoreItems(context.Background(), params, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !ddb.scanned || ddb.token != "page-token" {
		t.Fatalf("scan token = %q scanned=%v", ddb.token, ddb.scanned)
	}
	workspace, ok := result.(models.WorkspaceSnapshot)
	if !ok {
		t.Fatalf("result type %T", result)
	}
	if len(workspace.DynamoDBTables) != 1 {
		t.Fatalf("tables = %d", len(workspace.DynamoDBTables))
	}
	table := workspace.DynamoDBTables[0]
	if len(table.SampleItems) != 1 || table.SampleItems[0] != `{"id":"page-2"}` {
		t.Fatalf("sample items = %#v", table.SampleItems)
	}
	if !table.SampleItemsHasMore || table.SampleItemsNextToken != "next-token" {
		t.Fatalf("pagination = hasMore=%v token=%q", table.SampleItemsHasMore, table.SampleItemsNextToken)
	}
}

func TestHandleDynamoDBLoadMoreItemsRequiresToken(t *testing.T) {
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: discovery.Snapshot{
			Profiles: []models.ProfileSummary{{ProfileID: "p1", ProviderID: "aws"}},
		}},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked: true, CurrentProviderID: "aws", SelectedProfileID: "p1",
			SelectedDynamoDBTableName: "orders",
		}},
		Workspace: &fakeWorkspace{},
		DynamoDB:  &fakeDynamoDB{},
	})
	if _, err := svc.HandleDynamoDBLoadMoreItems(context.Background(), []byte(`{"tableName":"orders"}`), nil); err == nil {
		t.Fatal("expected continuation token error")
	}
}

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
