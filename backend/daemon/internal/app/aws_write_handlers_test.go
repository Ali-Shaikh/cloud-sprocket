// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"path/filepath"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
)

func TestServiceRejectsPhase2And3WriteRPCsWithoutWriteMode(t *testing.T) {
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")

	mustWriteFile(t, filepath.Join(home, ".aws", "config"), "[profile sandbox]\nregion = us-east-1\nendpoint_url = http://192.168.50.168:4566\ncloudsprocket_allow_writes = true\n")
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
		buckets: []models.AwsS3Bucket{{Name: "demo-bucket", Summary: "Demo bucket"}},
		objects: map[string][]models.AwsS3Object{
			"demo-bucket": {{Key: "readme.txt", Size: "12"}},
		},
	}
	ec2Inventory := &stubEC2Inventory{
		regions: []string{"us-east-1"},
		instances: map[string][]models.AwsEc2Instance{
			"us-east-1": {{InstanceID: "i-0123456789abcdef0", State: "running"}},
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
		stubLambdaInventory{},
		stubDynamoDBInventory{},
		stubSQSInventory{},
		stubSNSInventory{},
		stubRDSInventory{},
		stubECSInventory{},
		stubEKSInventory{},
		stubApiGatewayInventory{},
		stubSecretsManagerInventory{},
		stubLogsInventory{},
		stubIAMInventory{},
		stubAzureInventory{},
		stubDockerRuntime{},
	)

	ctx := context.Background()
	if _, err := service.Handle(ctx, "session.lock", nil, nil); err != nil {
		t.Fatalf("expected session.lock to succeed, got %v", err)
	}
	if _, err := service.Handle(ctx, "aws.s3.selectBucket", []byte(`{"bucketName":"demo-bucket"}`), nil); err != nil {
		t.Fatalf("expected aws.s3.selectBucket to succeed, got %v", err)
	}
	if _, err := service.Handle(ctx, "aws.s3.selectObject", []byte(`{"objectKey":"readme.txt"}`), nil); err != nil {
		t.Fatalf("expected aws.s3.selectObject to succeed, got %v", err)
	}
	if _, err := service.Handle(ctx, "aws.ec2.selectRegion", []byte(`{"region":"us-east-1"}`), nil); err != nil {
		t.Fatalf("expected aws.ec2.selectRegion to succeed, got %v", err)
	}
	if _, err := service.Handle(ctx, "aws.lambda.selectRegion", []byte(`{"region":"us-east-1"}`), nil); err != nil {
		t.Fatalf("expected aws.lambda.selectRegion to succeed, got %v", err)
	}
	if _, err := service.Handle(ctx, "aws.rds.selectRegion", []byte(`{"region":"us-east-1"}`), nil); err != nil {
		t.Fatalf("expected aws.rds.selectRegion to succeed, got %v", err)
	}
	if _, err := service.Handle(ctx, "aws.logs.selectRegion", []byte(`{"region":"us-east-1"}`), nil); err != nil {
		t.Fatalf("expected aws.logs.selectRegion to succeed, got %v", err)
	}

	cases := []struct {
		name   string
		method string
		params string
	}{
		{name: "S3 delete object", method: "aws.s3.deleteObject", params: `{"objectKey":"readme.txt"}`},
		{name: "S3 create bucket", method: "aws.s3.createBucket", params: `{"bucketName":"new-bucket"}`},
		{name: "EC2 launch instance", method: "aws.ec2.runInstances", params: `{"instanceType":"t3.micro"}`},
		{name: "EC2 terminate instance", method: "aws.ec2.terminateInstances", params: `{"instanceId":"i-0123456789abcdef0"}`},
		{name: "Lambda delete function", method: "aws.lambda.deleteFunction", params: `{"functionName":"demo-fn"}`},
		{name: "RDS start instance", method: "aws.rds.startInstance", params: `{"instanceId":"cloudsprocket-db"}`},
		{name: "RDS stop instance", method: "aws.rds.stopInstance", params: `{"instanceId":"cloudsprocket-db"}`},
		{name: "Logs create log group", method: "aws.logs.createLogGroup", params: `{"logGroupName":"/aws/test/group"}`},
		{name: "Logs put log events", method: "aws.logs.putLogEvents", params: `{"logGroupName":"/aws/test/group","message":"hello"}`},
		{name: "IAM create role", method: "aws.iam.createRole", params: `{"roleName":"demo-lambda-role"}`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := service.Handle(ctx, tc.method, []byte(tc.params), nil); err == nil {
				t.Fatalf("expected %s to be rejected without write mode enabled", tc.method)
			}
		})
	}

	if len(ec2Inventory.actionRequests) != 0 {
		t.Fatalf("expected rejected actions to avoid EC2 adapter calls, got %+v", ec2Inventory.actionRequests)
	}
}