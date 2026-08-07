// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package labs

import (
	"context"
	"errors"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

type fakeSQSWrite struct {
	called    bool
	queueURL  string
	body      string
	region    string
	result    models.AwsSqsSendResult
	err       error
}

func (f *fakeSQSWrite) SendMessage(
	_ context.Context,
	_ models.ProfileSummary,
	region string,
	queueURL string,
	messageBody string,
) (models.AwsSqsSendResult, error) {
	f.called = true
	f.region = region
	f.queueURL = queueURL
	f.body = messageBody
	return f.result, f.err
}

type fakeDynamoWrite struct {
	called bool
	table  string
	item   string
}

func (f *fakeDynamoWrite) PutItem(
	_ context.Context,
	_ models.ProfileSummary,
	_ string,
	tableName string,
	itemJSON string,
) (models.AwsDynamoDBWriteResult, error) {
	f.called = true
	f.table = tableName
	f.item = itemJSON
	return models.AwsDynamoDBWriteResult{}, nil
}

type fakeSNSWrite struct{ called bool }

func (f *fakeSNSWrite) Publish(
	_ context.Context,
	_ models.ProfileSummary,
	_ string,
	_ string,
	_ string,
) (models.AwsSnsPublishResult, error) {
	f.called = true
	return models.AwsSnsPublishResult{}, nil
}

type fakeLambdaWrite struct {
	called   bool
	function string
	payload  []byte
}

func (f *fakeLambdaWrite) InvokeFunction(
	_ context.Context,
	_ models.ProfileSummary,
	_ string,
	functionName string,
	payload []byte,
) (models.AwsLambdaInvokeResult, error) {
	f.called = true
	f.function = functionName
	f.payload = append([]byte(nil), payload...)
	return models.AwsLambdaInvokeResult{}, nil
}

type fakeLogsWrite struct{ called bool }

func (f *fakeLogsWrite) PutLogEvents(
	_ context.Context,
	_ models.ProfileSummary,
	_ string,
	_ string,
	_ string,
) (models.AwsLogsPutLogEventsResult, error) {
	f.called = true
	return models.AwsLogsPutLogEventsResult{}, nil
}

type fakeS3Write struct {
	called bool
	bucket string
	key    string
	source string
}

func (f *fakeS3Write) UploadFile(
	_ context.Context,
	_ models.ProfileSummary,
	bucketName string,
	objectKey string,
	sourcePath string,
) (models.AwsS3UploadResult, error) {
	f.called = true
	f.bucket = bucketName
	f.key = objectKey
	f.source = sourcePath
	return models.AwsS3UploadResult{}, nil
}

func writeTestSession() models.SessionSnapshot {
	return models.SessionSnapshot{
		IsLocked:           true,
		AWSWriteModeEnabled: true,
	}
}

func writeTestDeployment(provider string) *deploy.Deployment {
	return &deploy.Deployment{
		ID:         "dep-write",
		RecipeID:   "recipe-lab",
		ProviderID: provider,
		ProfileID:  "local",
		Status:     deploy.StatusApplied,
	}
}

func writeTestProfile() models.ProfileSummary {
	return models.ProfileSummary{ProfileID: "local", ProviderID: "aws"}
}

func TestInvokeWriteUnknownOp(t *testing.T) {
	t.Parallel()
	svc := New(Deps{})
	_, err := svc.InvokeWrite(
		context.Background(),
		discovery.Snapshot{},
		writeTestSession(),
		writeTestDeployment("aws"),
		writeTestProfile(),
		"us-east-1",
		"not.a.real.op",
		nil,
	)
	if err == nil || !strings.Contains(err.Error(), "not supported") {
		t.Fatalf("expected unsupported op error, got %v", err)
	}
}

func TestInvokeWriteRequiresAWSProvider(t *testing.T) {
	t.Parallel()
	sqs := &fakeSQSWrite{}
	svc := New(Deps{SQS: sqs})
	_, err := svc.InvokeWrite(
		context.Background(),
		discovery.Snapshot{},
		writeTestSession(),
		writeTestDeployment("azure"),
		writeTestProfile(),
		"us-east-1",
		"sqs.send",
		map[string]string{"queueUrl": "https://example/q", "messageBody": "hi"},
	)
	if err == nil || !strings.Contains(err.Error(), "only available for AWS") {
		t.Fatalf("expected AWS-only error, got %v", err)
	}
	if sqs.called {
		t.Fatal("SQS should not be called when provider gate fails")
	}
}

func TestInvokeWriteRequiresWriteMode(t *testing.T) {
	t.Parallel()
	sqs := &fakeSQSWrite{}
	svc := New(Deps{SQS: sqs})
	session := writeTestSession()
	session.AWSWriteModeEnabled = false
	_, err := svc.InvokeWrite(
		context.Background(),
		discovery.Snapshot{},
		session,
		writeTestDeployment("aws"),
		writeTestProfile(),
		"us-east-1",
		"sqs.send",
		map[string]string{"queueUrl": "https://example/q", "messageBody": "hi"},
	)
	if err == nil || !strings.Contains(err.Error(), "write mode") {
		t.Fatalf("expected write-mode error, got %v", err)
	}
	if sqs.called {
		t.Fatal("SQS should not be called when write mode is off")
	}
}

func TestInvokeWriteSQSSendSuccess(t *testing.T) {
	t.Parallel()
	sqs := &fakeSQSWrite{result: models.AwsSqsSendResult{MessageID: "msg-1"}}
	svc := New(Deps{SQS: sqs})
	result, err := svc.InvokeWrite(
		context.Background(),
		discovery.Snapshot{},
		writeTestSession(),
		writeTestDeployment("aws"),
		writeTestProfile(),
		"eu-west-1",
		"sqs.send",
		map[string]string{"queueUrl": "https://example/q", "messageBody": "hello"},
	)
	if err != nil {
		t.Fatalf("InvokeWrite: %v", err)
	}
	if !sqs.called {
		t.Fatal("expected SQS SendMessage")
	}
	if sqs.queueURL != "https://example/q" || sqs.body != "hello" || sqs.region != "eu-west-1" {
		t.Fatalf("unexpected call: url=%q body=%q region=%q", sqs.queueURL, sqs.body, sqs.region)
	}
	send, ok := result.(models.AwsSqsSendResult)
	if !ok || send.MessageID != "msg-1" {
		t.Fatalf("result = %#v", result)
	}
}

func TestInvokeWriteSQSSendValidation(t *testing.T) {
	t.Parallel()
	svc := New(Deps{SQS: &fakeSQSWrite{}})
	cases := []struct {
		name   string
		params map[string]string
		want   string
	}{
		{name: "missing queue", params: map[string]string{"messageBody": "x"}, want: "queue URL"},
		{name: "missing body", params: map[string]string{"queueUrl": "https://q"}, want: "message body"},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, err := svc.InvokeWrite(
				context.Background(),
				discovery.Snapshot{},
				writeTestSession(),
				writeTestDeployment("aws"),
				writeTestProfile(),
				"us-east-1",
				"sqs.send",
				tc.params,
			)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("expected %q error, got %v", tc.want, err)
			}
		})
	}
}

func TestInvokeWriteDynamoLambdaS3(t *testing.T) {
	t.Parallel()
	dynamo := &fakeDynamoWrite{}
	lambda := &fakeLambdaWrite{}
	s3 := &fakeS3Write{}
	svc := New(Deps{DynamoDB: dynamo, Lambda: lambda, S3: s3})

	_, err := svc.InvokeWrite(
		context.Background(),
		discovery.Snapshot{},
		writeTestSession(),
		writeTestDeployment("aws"),
		writeTestProfile(),
		"us-east-1",
		"dynamodb.put",
		map[string]string{"tableName": "items", "itemJson": `{"id":"1"}`},
	)
	if err != nil {
		t.Fatalf("dynamodb.put: %v", err)
	}
	if !dynamo.called || dynamo.table != "items" || dynamo.item != `{"id":"1"}` {
		t.Fatalf("dynamo call: %#v", dynamo)
	}

	_, err = svc.InvokeWrite(
		context.Background(),
		discovery.Snapshot{},
		writeTestSession(),
		writeTestDeployment("aws"),
		writeTestProfile(),
		"us-east-1",
		"lambda.invoke",
		map[string]string{"functionName": "fn", "payload": `{"a":1}`},
	)
	if err != nil {
		t.Fatalf("lambda.invoke: %v", err)
	}
	if !lambda.called || lambda.function != "fn" || string(lambda.payload) != `{"a":1}` {
		t.Fatalf("lambda call: function=%q payload=%s", lambda.function, lambda.payload)
	}

	_, err = svc.InvokeWrite(
		context.Background(),
		discovery.Snapshot{},
		writeTestSession(),
		writeTestDeployment("aws"),
		writeTestProfile(),
		"us-east-1",
		"s3.upload",
		map[string]string{"bucketName": "b", "objectKey": "k", "sourcePath": "/tmp/f"},
	)
	if err != nil {
		t.Fatalf("s3.upload: %v", err)
	}
	if !s3.called || s3.bucket != "b" || s3.key != "k" || s3.source != "/tmp/f" {
		t.Fatalf("s3 call: %#v", s3)
	}
}

func TestInvokeWriteLambdaDefaultPayload(t *testing.T) {
	t.Parallel()
	lambda := &fakeLambdaWrite{}
	svc := New(Deps{Lambda: lambda})
	_, err := svc.InvokeWrite(
		context.Background(),
		discovery.Snapshot{},
		writeTestSession(),
		writeTestDeployment("aws"),
		writeTestProfile(),
		"us-east-1",
		"lambda.invoke",
		map[string]string{"functionName": "fn"},
	)
	if err != nil {
		t.Fatalf("lambda.invoke: %v", err)
	}
	if string(lambda.payload) != "{}" {
		t.Fatalf("default payload = %q", lambda.payload)
	}
}

func TestInvokeWriteSNSAndLogs(t *testing.T) {
	t.Parallel()
	sns := &fakeSNSWrite{}
	logs := &fakeLogsWrite{}
	svc := New(Deps{SNS: sns, Logs: logs})

	_, err := svc.InvokeWrite(
		context.Background(),
		discovery.Snapshot{},
		writeTestSession(),
		writeTestDeployment("aws"),
		writeTestProfile(),
		"us-east-1",
		"sns.publish",
		map[string]string{"topicArn": "arn:aws:sns:x", "message": "hi"},
	)
	if err != nil {
		t.Fatalf("sns.publish: %v", err)
	}
	if !sns.called {
		t.Fatal("expected SNS Publish")
	}

	_, err = svc.InvokeWrite(
		context.Background(),
		discovery.Snapshot{},
		writeTestSession(),
		writeTestDeployment("aws"),
		writeTestProfile(),
		"us-east-1",
		"logs.put",
		map[string]string{"logGroupName": "/app", "message": "line"},
	)
	if err != nil {
		t.Fatalf("logs.put: %v", err)
	}
	if !logs.called {
		t.Fatal("expected Logs PutLogEvents")
	}
}

func TestInvokeWritePropagatesAdapterError(t *testing.T) {
	t.Parallel()
	sqs := &fakeSQSWrite{err: errors.New("queue gone")}
	svc := New(Deps{SQS: sqs})
	_, err := svc.InvokeWrite(
		context.Background(),
		discovery.Snapshot{},
		writeTestSession(),
		writeTestDeployment("aws"),
		writeTestProfile(),
		"us-east-1",
		"sqs.send",
		map[string]string{"queueUrl": "https://example/q", "messageBody": "hi"},
	)
	if err == nil || !strings.Contains(err.Error(), "queue gone") {
		t.Fatalf("expected adapter error, got %v", err)
	}
}
