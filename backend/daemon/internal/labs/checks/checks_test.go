// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package checks

import (
	"context"
	"errors"
	"testing"

	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/labs"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/recipes"
)

func testCtx() labs.CheckContext {
	return labs.CheckContext{
		Deployment: &deploy.Deployment{
			Outputs: []deploy.Output{
				{Name: "bucket_name", Value: "lab-bucket"},
				{Name: "table_name", Value: "lab-table"},
				{Name: "queue_url", Value: "https://sqs.example/q"},
				{Name: "function_name", Value: "lab-fn"},
				{Name: "log_group_name", Value: "/aws/lab"},
				{Name: "secret_name", Value: "lab/secret"},
				{Name: "topic_arn", Value: "arn:aws:sns:eu-west-1:1:topic"},
				{Name: "storage_account_name", Value: "labsa"},
				{Name: "container_name", Value: "labcontainer"},
				{Name: "queue_name", Value: "labqueue"},
			},
		},
		Profile:          models.ProfileSummary{ProfileID: "local", ProviderID: "aws"},
		Region:           "eu-west-1",
		AWSWritesEnabled: true,
	}
}

func TestS3ObjectCheckExistsAndContains(t *testing.T) {
	t.Parallel()
	check := &S3ObjectCheck{Deps: S3Deps{
		HeadObject: func(_ context.Context, _ models.ProfileSummary, bucket, key string) ([]models.DetailField, error) {
			if bucket != "lab-bucket" || key != "hello.txt" {
				return nil, errors.New("missing")
			}
			return []models.DetailField{}, nil
		},
		GetObject: func(_ context.Context, _ models.ProfileSummary, _, _ string) (string, error) {
			return "hello lab world", nil
		},
	}}
	result, err := check.Run(context.Background(), recipes.LabVerify{
		Type: recipes.LabVerifyS3Object, Bucket: "{{ outputs.bucket_name }}", Key: "hello.txt", Contains: "lab",
	}, testCtx())
	if err != nil {
		t.Fatal(err)
	}
	if !result.Passed {
		t.Fatalf("expected pass: %+v", result)
	}
}

func TestDynamoDBItemCheckAttributeEquals(t *testing.T) {
	t.Parallel()
	check := &DynamoDBItemCheck{Deps: DynamoDeps{
		GetItem: func(_ context.Context, _ models.ProfileSummary, _, table, keyJSON string) (map[string]any, bool, error) {
			if table != "lab-table" || keyJSON != `{"pk":"demo"}` {
				return nil, false, nil
			}
			return map[string]any{"pk": "demo", "status": "ready"}, true, nil
		},
	}}
	result, err := check.Run(context.Background(), recipes.LabVerify{
		Type: recipes.LabVerifyDynamoDBItem, Table: "{{ outputs.table_name }}", KeyJSON: `{"pk":"demo"}`,
		Attribute: "status", Value: "ready",
	}, testCtx())
	if err != nil {
		t.Fatal(err)
	}
	if !result.Passed {
		t.Fatalf("expected pass: %+v", result)
	}
}

func TestLambdaInvokeCheckPayloadContains(t *testing.T) {
	t.Parallel()
	check := &LambdaInvokeCheck{Deps: LambdaDeps{
		Invoke: func(_ context.Context, _ models.ProfileSummary, _, name string, _ []byte) (models.AwsLambdaInvokeResult, error) {
			if name != "lab-fn" {
				return models.AwsLambdaInvokeResult{}, errors.New("missing")
			}
			return models.AwsLambdaInvokeResult{StatusCode: 200, Payload: `{"ok":true}`}, nil
		},
	}}
	result, err := check.Run(context.Background(), recipes.LabVerify{
		Type: recipes.LabVerifyLambdaInvoke, Function: "{{ outputs.function_name }}", Contains: `"ok":true`,
	}, testCtx())
	if err != nil {
		t.Fatal(err)
	}
	if !result.Passed {
		t.Fatalf("expected pass: %+v", result)
	}
}

func TestLogsContainsCheck(t *testing.T) {
	t.Parallel()
	check := &LogsContainsCheck{Deps: LogsDeps{
		DescribeLogGroup: func(_ context.Context, _ models.ProfileSummary, _, group string) (models.AwsLogGroup, error) {
			return models.AwsLogGroup{LogGroupName: group, RecentEvents: []string{"2026-07-13 START lab event"}}, nil
		},
	}}
	result, err := check.Run(context.Background(), recipes.LabVerify{
		Type: recipes.LabVerifyLogsContains, LogGroup: "{{ outputs.log_group_name }}", Pattern: "lab event",
	}, testCtx())
	if err != nil {
		t.Fatal(err)
	}
	if !result.Passed {
		t.Fatalf("expected pass: %+v", result)
	}
}

func TestSecretsValueCheck(t *testing.T) {
	t.Parallel()
	check := &SecretsValueCheck{Deps: SecretsDeps{
		GetSecretValue: func(_ context.Context, _ models.ProfileSummary, _, secretID string) (string, error) {
			if secretID != "lab/secret" {
				return "", errors.New("missing")
			}
			return "super-secret", nil
		},
	}}
	result, err := check.Run(context.Background(), recipes.LabVerify{
		Type: recipes.LabVerifySecretsValue, Secret: "{{ outputs.secret_name }}", Value: "super-secret",
	}, testCtx())
	if err != nil {
		t.Fatal(err)
	}
	if !result.Passed {
		t.Fatalf("expected pass: %+v", result)
	}
}

func TestSNSSubscriptionCheckCount(t *testing.T) {
	t.Parallel()
	check := &SNSSubscriptionCheck{Deps: SNSDeps{
		DescribeTopic: func(_ context.Context, _ models.ProfileSummary, _, arn string) (models.AwsSnsTopic, error) {
			return models.AwsSnsTopic{
				TopicArn: arn,
				Subscriptions: []models.AwsSnsSubscription{
					{SubscriptionArn: "sub-1"},
					{SubscriptionArn: "sub-2"},
				},
			}, nil
		},
	}}
	result, err := check.Run(context.Background(), recipes.LabVerify{
		Type: recipes.LabVerifySNSSubscription, Topic: "{{ outputs.topic_arn }}", Compare: "gte", Value: "2",
	}, testCtx())
	if err != nil {
		t.Fatal(err)
	}
	if !result.Passed {
		t.Fatalf("expected pass: %+v", result)
	}
}

func TestLambdaInvokeRequiresWriteMode(t *testing.T) {
	t.Parallel()
	invoked := false
	check := &LambdaInvokeCheck{Deps: LambdaDeps{
		Invoke: func(_ context.Context, _ models.ProfileSummary, _, _ string, _ []byte) (models.AwsLambdaInvokeResult, error) {
			invoked = true
			return models.AwsLambdaInvokeResult{StatusCode: 200}, nil
		},
	}}
	ctx := testCtx()
	ctx.AWSWritesEnabled = false
	result, err := check.Run(context.Background(), recipes.LabVerify{
		Type: recipes.LabVerifyLambdaInvoke, Function: "{{ outputs.function_name }}",
	}, ctx)
	if err != nil {
		t.Fatal(err)
	}
	if result.Passed {
		t.Fatal("expected fail when write mode is off")
	}
	if invoked {
		t.Fatal("must not invoke Lambda when write mode is off")
	}
}

func TestSecretsValueRejectsEmptyCriteria(t *testing.T) {
	t.Parallel()
	revealed := false
	check := &SecretsValueCheck{Deps: SecretsDeps{
		GetSecretValue: func(_ context.Context, _ models.ProfileSummary, _, _ string) (string, error) {
			revealed = true
			return "anything", nil
		},
	}}
	// Deployment var present but empty → {{ vars.secret_value }} resolves to "".
	ctx := testCtx()
	ctx.Deployment.Variables = map[string]any{"secret_value": ""}
	result, err := check.Run(context.Background(), recipes.LabVerify{
		Type: recipes.LabVerifySecretsValue, Secret: "{{ outputs.secret_name }}", Value: "{{ vars.secret_value }}",
	}, ctx)
	if err != nil {
		t.Fatal(err)
	}
	if result.Passed {
		t.Fatal("empty resolved criteria must not pass")
	}
	if revealed {
		t.Fatal("must not reveal secret when criteria resolve empty")
	}
}

func TestSecretsValueRequiresWriteMode(t *testing.T) {
	t.Parallel()
	revealed := false
	check := &SecretsValueCheck{Deps: SecretsDeps{
		GetSecretValue: func(_ context.Context, _ models.ProfileSummary, _, _ string) (string, error) {
			revealed = true
			return "x", nil
		},
	}}
	ctx := testCtx()
	ctx.AWSWritesEnabled = false
	result, err := check.Run(context.Background(), recipes.LabVerify{
		Type: recipes.LabVerifySecretsValue, Secret: "{{ outputs.secret_name }}", Value: "x",
	}, ctx)
	if err != nil {
		t.Fatal(err)
	}
	if result.Passed {
		t.Fatal("expected fail when write mode is off")
	}
	if revealed {
		t.Fatal("must not reveal secret when write mode is off")
	}
}

func TestCompareInt64RejectsUnknownOperator(t *testing.T) {
	t.Parallel()
	if _, err := compareInt64(1, 1, "ne"); err == nil {
		t.Fatal("expected error for unknown compare operator")
	}
	ok, err := compareInt64(2, 1, "gte")
	if err != nil || !ok {
		t.Fatalf("gte: ok=%v err=%v", ok, err)
	}
}

func TestAzureBlobAndQueueDepthChecks(t *testing.T) {
	t.Parallel()
	blobCheck := &AzureBlobCheck{Deps: AzureBlobDeps{
		ListBlobs: func(_ context.Context, _ models.ProfileSummary, account, container, prefix string) ([]models.AzureBlob, error) {
			if account != "labsa" || container != "labcontainer" {
				return nil, errors.New("wrong scope")
			}
			return []models.AzureBlob{{Name: prefix}}, nil
		},
	}}
	blobResult, err := blobCheck.Run(context.Background(), recipes.LabVerify{
		Type: recipes.LabVerifyAzureBlob, Account: "{{ outputs.storage_account_name }}",
		Container: "{{ outputs.container_name }}", Blob: "readme.txt",
	}, testCtx())
	if err != nil {
		t.Fatal(err)
	}
	if !blobResult.Passed {
		t.Fatalf("blob: %+v", blobResult)
	}

	queueCheck := &AzureQueueDepthCheck{Deps: AzureQueueDeps{
		ApproximateCount: func(_ context.Context, _ models.ProfileSummary, account, queue string) (int64, error) {
			if account != "labsa" || queue != "labqueue" {
				return 0, errors.New("wrong queue")
			}
			return 3, nil
		},
	}}
	queueResult, err := queueCheck.Run(context.Background(), recipes.LabVerify{
		Type: recipes.LabVerifyAzureQueueDepth, Account: "{{ outputs.storage_account_name }}",
		Queue: "{{ outputs.queue_name }}", Compare: "gte", Value: "1",
	}, testCtx())
	if err != nil {
		t.Fatal(err)
	}
	if !queueResult.Passed {
		t.Fatalf("queue: %+v", queueResult)
	}
}
