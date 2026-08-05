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
	snapshot models.WorkspaceSnapshot
}

func (f *fakeWorkspace) Build(_ context.Context, _ discovery.Snapshot, _ models.SessionSnapshot, opts sessionport.SnapshotOptions) models.WorkspaceSnapshot {
	f.built++
	f.lastOpts = opts
	if f.snapshot.DynamoDBTables != nil || f.snapshot.SelectedDynamoDBTableName != "" {
		return f.snapshot
	}
	if f.snapshot.SelectedS3BucketName != "" {
		return f.snapshot
	}
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

func TestAllSelectHandlersSucceedOnLockedAWSSession(t *testing.T) {
	type caseSpec struct {
		name   string
		params map[string]string
		call   func(*Service, context.Context, json.RawMessage, sessionport.Notifier) (any, error)
		scope  string
		// check asserts session mutations when non-nil
		check func(t *testing.T, session models.SessionSnapshot)
	}

	cases := []caseSpec{
		{
			name:   "s3.object",
			params: map[string]string{"objectKey": "k"},
			call:   (*Service).HandleS3SelectObject,
			scope:  "s3",
			check: func(t *testing.T, session models.SessionSnapshot) {
				if session.SelectedS3ObjectKey != "k" {
					t.Fatalf("object key = %q", session.SelectedS3ObjectKey)
				}
			},
		},
		{
			name:   "s3.prefix",
			params: map[string]string{"prefix": "docs/"},
			call:   (*Service).HandleS3SetPrefixFilter,
			scope:  "s3",
		},
		{
			name:   "ec2.instance",
			params: map[string]string{"instanceId": "i-1"},
			call:   (*Service).HandleEC2SelectInstance,
			scope:  "",
		},
		{
			name:   "lambda.region",
			params: map[string]string{"region": "us-east-1"},
			call:   (*Service).HandleLambdaSelectRegion,
			scope:  "lambda",
		},
		{
			name:   "lambda.function",
			params: map[string]string{"functionName": "fn"},
			call:   (*Service).HandleLambdaSelectFunction,
			scope:  "lambda",
		},
		{
			name:   "dynamodb.region",
			params: map[string]string{"region": "us-east-1"},
			call:   (*Service).HandleDynamoDBSelectRegion,
			scope:  "dynamodb",
		},
		{
			name:   "dynamodb.table",
			params: map[string]string{"tableName": "t"},
			call:   (*Service).HandleDynamoDBSelectTable,
			scope:  "dynamodb",
		},
		{
			name:   "sqs.region",
			params: map[string]string{"region": "us-east-1"},
			call:   (*Service).HandleSQSSelectRegion,
			scope:  "sqs",
		},
		{
			name:   "sqs.queue",
			params: map[string]string{"queueUrl": "https://q"},
			call:   (*Service).HandleSQSSelectQueue,
			scope:  "sqs",
		},
		{
			name:   "sns.region",
			params: map[string]string{"region": "us-east-1"},
			call:   (*Service).HandleSNSSelectRegion,
			scope:  "sns",
		},
		{
			name:   "sns.topic",
			params: map[string]string{"topicArn": "arn:topic"},
			call:   (*Service).HandleSNSSelectTopic,
			scope:  "sns",
		},
		{
			name:   "rds.region",
			params: map[string]string{"region": "us-east-1"},
			call:   (*Service).HandleRDSSelectRegion,
			scope:  "rds",
		},
		{
			name:   "rds.instance",
			params: map[string]string{"instanceId": "db-1"},
			call:   (*Service).HandleRDSSelectInstance,
			scope:  "rds",
		},
		{
			name:   "ecs.region",
			params: map[string]string{"region": "us-east-1"},
			call:   (*Service).HandleECSSelectRegion,
			scope:  "ecs",
		},
		{
			name:   "ecs.cluster",
			params: map[string]string{"clusterArn": "arn:cluster"},
			call:   (*Service).HandleECSSelectCluster,
			scope:  "ecs",
		},
		{
			name:   "ecs.service",
			params: map[string]string{"serviceArn": "arn:svc"},
			call:   (*Service).HandleECSSelectService,
			scope:  "ecs",
		},
		{
			name:   "ecs.task",
			params: map[string]string{"taskArn": "arn:task"},
			call:   (*Service).HandleECSSelectTask,
			scope:  "ecs",
		},
		{
			name:   "eks.region",
			params: map[string]string{"region": "us-east-1"},
			call:   (*Service).HandleEKSSelectRegion,
			scope:  "eks",
		},
		{
			name:   "eks.cluster",
			params: map[string]string{"clusterName": "prod"},
			call:   (*Service).HandleEKSSelectCluster,
			scope:  "eks",
		},
		{
			name:   "cfn.region",
			params: map[string]string{"region": "us-east-1"},
			call:   (*Service).HandleCloudFormationSelectRegion,
			scope:  "cloudformation",
		},
		{
			name:   "cfn.stack",
			params: map[string]string{"stackName": "stack"},
			call:   (*Service).HandleCloudFormationSelectStack,
			scope:  "cloudformation",
		},
		{
			name:   "eb.region",
			params: map[string]string{"region": "us-east-1"},
			call:   (*Service).HandleEventBridgeSelectRegion,
			scope:  "eventbridge",
		},
		{
			name:   "eb.bus",
			params: map[string]string{"busName": "default"},
			call:   (*Service).HandleEventBridgeSelectBus,
			scope:  "eventbridge",
		},
		{
			name:   "route53.zone",
			params: map[string]string{"hostedZoneId": "Z1"},
			call:   (*Service).HandleRoute53SelectHostedZone,
			scope:  "route53",
		},
		{
			name:   "elb.region",
			params: map[string]string{"region": "us-east-1"},
			call:   (*Service).HandleELBSelectRegion,
			scope:  "elb",
		},
		{
			name:   "elb.lb",
			params: map[string]string{"loadBalancerArn": "arn:lb"},
			call:   (*Service).HandleELBSelectLoadBalancer,
			scope:  "elb",
		},
		{
			name:   "kms.region",
			params: map[string]string{"region": "us-east-1"},
			call:   (*Service).HandleKMSSelectRegion,
			scope:  "kms",
		},
		{
			name:   "kms.key",
			params: map[string]string{"keyId": "key-1"},
			call:   (*Service).HandleKMSSelectKey,
			scope:  "kms",
		},
		{
			name:   "apigw.region",
			params: map[string]string{"region": "us-east-1"},
			call:   (*Service).HandleAPIGatewaySelectRegion,
			scope:  "apigateway",
		},
		{
			name:   "apigw.api",
			params: map[string]string{"apiKey": "rest:abc"},
			call:   (*Service).HandleAPIGatewaySelectAPI,
			scope:  "apigateway",
		},
		{
			name:   "secrets.region",
			params: map[string]string{"region": "us-east-1"},
			call:   (*Service).HandleSecretsSelectRegion,
			scope:  "secrets",
		},
		{
			name:   "secrets.secret",
			params: map[string]string{"secretName": "  my-secret  "},
			call:   (*Service).HandleSecretsSelectSecret,
			scope:  "secrets",
			check: func(t *testing.T, session models.SessionSnapshot) {
				if session.SelectedSecretsManagerName != "my-secret" {
					t.Fatalf("secret name = %q", session.SelectedSecretsManagerName)
				}
			},
		},
		{
			name:   "logs.region",
			params: map[string]string{"region": "us-east-1"},
			call:   (*Service).HandleLogsSelectRegion,
			scope:  "logs",
		},
		{
			name:   "logs.group",
			params: map[string]string{"logGroupName": "/aws/lambda/fn"},
			call:   (*Service).HandleLogsSelectLogGroup,
			scope:  "logs",
		},
		{
			name:   "iam.role",
			params: map[string]string{"roleName": "Admin"},
			call:   (*Service).HandleIAMSelectRole,
			scope:  "iam",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sess := &fakeSession{session: models.SessionSnapshot{
				IsLocked:             true,
				CurrentProviderID:    "aws",
				SelectedS3BucketName: "bucket",
			}}
			ws := &fakeWorkspace{}
			svc := New(Deps{
				Discovery:   fakeDiscovery{},
				Session:     sess,
				Workspace:   ws,
				Activity:    &fakeActivity{},
				Invalidator: &fakeInvalidator{},
			})
			params, err := json.Marshal(tc.params)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := tc.call(svc, context.Background(), params, nil); err != nil {
				t.Fatalf("handler: %v", err)
			}
			if ws.lastOpts.AWSScope != tc.scope {
				t.Fatalf("AWSScope = %q, want %q", ws.lastOpts.AWSScope, tc.scope)
			}
			if !ws.lastOpts.SkipAzureInventory {
				t.Fatal("expected SkipAzureInventory")
			}
			if tc.check != nil {
				tc.check(t, sess.session)
			}
		})
	}
}

func TestSelectHandlersRejectInvalidJSON(t *testing.T) {
	svc := New(Deps{
		Discovery: fakeDiscovery{},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:          true,
			CurrentProviderID: "aws",
		}},
		Workspace: &fakeWorkspace{},
	})
	_, err := svc.HandleIAMSelectRole(context.Background(), json.RawMessage(`{`), nil)
	if err == nil {
		t.Fatal("expected JSON error")
	}
}

func TestFinishAWSSelectionLogOnlySkipsStateNotify(t *testing.T) {
	act := &fakeActivity{}
	ws := &fakeWorkspace{}
	svc := New(Deps{
		Discovery: fakeDiscovery{},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:          true,
			CurrentProviderID: "aws",
		}},
		Workspace: ws,
		Activity:  act,
	})
	// Lambda region uses logOnly=true
	params, _ := json.Marshal(map[string]string{"region": "eu-west-2"})
	if _, err := svc.HandleLambdaSelectRegion(context.Background(), params, nil); err != nil {
		t.Fatal(err)
	}
	if act.notified != 0 {
		t.Fatalf("logOnly must not call NotifyStateAndLog, got %d", act.notified)
	}
}
