// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	appaws "cloudsprocket/backend/daemon/internal/app/aws"
	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
)

type countingS3Inventory struct {
	stubS3Inventory
	listBuckets atomic.Int32
}

func (c *countingS3Inventory) ListBuckets(ctx context.Context, profile models.ProfileSummary) ([]models.AwsS3Bucket, error) {
	c.listBuckets.Add(1)
	return c.stubS3Inventory.ListBuckets(ctx, profile)
}

type countingEC2Inventory struct {
	stubEC2Inventory
	listRegions   atomic.Int32
	listInstances atomic.Int32
}

func (c *countingEC2Inventory) ListRegions(ctx context.Context, profile models.ProfileSummary) ([]string, error) {
	c.listRegions.Add(1)
	return c.stubEC2Inventory.ListRegions(ctx, profile)
}

func (c *countingEC2Inventory) ListInstances(ctx context.Context, profile models.ProfileSummary, region string) ([]models.AwsEc2Instance, error) {
	c.listInstances.Add(1)
	return c.stubEC2Inventory.ListInstances(ctx, profile, region)
}

type countingLambdaInventory struct {
	stubLambdaInventory
	listFunctions atomic.Int32
}

func (c *countingLambdaInventory) ListFunctions(context.Context, models.ProfileSummary, string) ([]models.AwsLambdaFunction, error) {
	c.listFunctions.Add(1)
	return nil, nil
}

func awsTestService(t *testing.T) (*Service, *countingS3Inventory, *countingEC2Inventory, *countingLambdaInventory) {
	t.Helper()
	dataStore, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = dataStore.Close() })

	s3 := &countingS3Inventory{stubS3Inventory: stubS3Inventory{
		buckets: []models.AwsS3Bucket{{Name: "demo-bucket"}},
	}}
	ec2 := &countingEC2Inventory{stubEC2Inventory: stubEC2Inventory{
		regions:   []string{"us-east-1"},
		instances: map[string][]models.AwsEc2Instance{"us-east-1": {{InstanceID: "i-001"}}},
	}}
	lambda := &countingLambdaInventory{}

	service := &Service{
		store:          dataStore,
		s3:             s3,
		ec2:            ec2,
		lambda:         lambda,
		dynamodb:       stubDynamoDBInventory{},
		sqs:            stubSQSInventory{},
		sns:            stubSNSInventory{},
		rds:            stubRDSInventory{},
		ecs:            stubECSInventory{},
		eks:            stubEKSInventory{},
		cloudformation: stubCloudFormationInventory{},
		eventbridge:    stubEventBridgeInventory{},
		route53:        stubRoute53Inventory{},
		elbv2:          stubElbv2Inventory{},
		kms:            stubKmsInventory{},
		apigateway:     stubApiGatewayInventory{},
		secretsManager: stubSecretsManagerInventory{},
		logs:           &stubLogsInventory{},
		iam:            &stubIAMInventory{},
		now:            func() time.Time { return time.Now().UTC() },
	}
	return service, s3, ec2, lambda
}

func TestAwsScopedWorkspaceOnlyRunsTargetEnricher(t *testing.T) {
	service, s3, ec2, lambda := awsTestService(t)

	snapshot := discovery.Snapshot{
		Providers: []models.ProviderSummary{{ProviderID: "aws", Label: "AWS"}},
		Profiles:  []models.ProfileSummary{{ProviderID: "aws", ProfileID: "sandbox", DisplayName: "sandbox"}},
	}
	session := models.SessionSnapshot{
		CurrentProviderID: "aws",
		SelectedProfileID: "sandbox",
		SelectedEC2Region: "us-east-1",
		IsLocked:          true,
	}

	workspace := service.buildWorkspaceSnapshotOpts(context.Background(), snapshot, session, workspaceSnapshotOptions{
		awsScope:           "ec2",
		skipAzureInventory: true,
	})

	if ec2.listRegions.Load() == 0 {
		t.Fatal("expected EC2 scoped snapshot to list regions")
	}
	if ec2.listInstances.Load() == 0 {
		t.Fatal("expected EC2 scoped snapshot to list instances")
	}
	if s3.listBuckets.Load() != 0 {
		t.Fatalf("expected S3 enricher to be skipped, listBuckets=%d", s3.listBuckets.Load())
	}
	if lambda.listFunctions.Load() != 0 {
		t.Fatalf("expected Lambda enricher to be skipped, listFunctions=%d", lambda.listFunctions.Load())
	}
	if workspace.SelectedEC2Region != "us-east-1" || len(workspace.EC2Instances) != 1 {
		t.Fatalf("expected EC2 inventory only, got region=%q instances=%+v", workspace.SelectedEC2Region, workspace.EC2Instances)
	}
	if len(workspace.S3Buckets) != 0 {
		t.Fatalf("expected no S3 buckets in EC2-scoped snapshot, got %+v", workspace.S3Buckets)
	}
}

func TestAwsDeferredWorkspaceGetSkipsNonCoreEnrichers(t *testing.T) {
	service, s3, ec2, lambda := awsTestService(t)

	snapshot := discovery.Snapshot{
		Providers: []models.ProviderSummary{{ProviderID: "aws", Label: "AWS"}},
		Profiles:  []models.ProfileSummary{{ProviderID: "aws", ProfileID: "sandbox", DisplayName: "sandbox"}},
	}
	session := models.SessionSnapshot{
		CurrentProviderID: "aws",
		SelectedProfileID: "sandbox",
		IsLocked:          true,
	}

	workspace := service.buildWorkspaceSnapshotOpts(context.Background(), snapshot, session, workspaceSnapshotOptions{
		lightweightAWS:       true,
		awsDeferredInventory: true,
		skipAzureInventory:   true,
	})

	if s3.listBuckets.Load() == 0 {
		t.Fatal("expected S3 buckets on deferred workspace.get")
	}
	if ec2.listRegions.Load() == 0 {
		t.Fatal("expected EC2 regions on deferred workspace.get")
	}
	if lambda.listFunctions.Load() != 0 {
		t.Fatalf("deferred workspace.get should not load Lambda, listFunctions=%d", lambda.listFunctions.Load())
	}
	if len(workspace.S3Buckets) != 1 {
		t.Fatalf("expected deferred S3 inventory, got %+v", workspace.S3Buckets)
	}
	if len(workspace.EC2Regions) != 1 {
		t.Fatalf("expected deferred EC2 regions, got %+v", workspace.EC2Regions)
	}
	if len(workspace.LambdaFunctions) != 0 {
		t.Fatal("deferred workspace.get should not load Lambda functions")
	}
}

func TestAwsInventoryGetRunsSingleEnricher(t *testing.T) {
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")
	mustWriteFile(
		t,
		filepath.Join(home, ".aws", "config"),
		"[profile sandbox]\nregion = us-east-1\n",
	)

	settings := config.FromEnv(map[string]string{}, "linux", home)
	if err := settings.EnsureRuntimeDirs(); err != nil {
		t.Fatalf("EnsureRuntimeDirs: %v", err)
	}

	dataStore, err := store.Open(settings.DatabasePath)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	defer dataStore.Close()

	s3 := &countingS3Inventory{stubS3Inventory: stubS3Inventory{
		buckets: []models.AwsS3Bucket{{Name: "demo-bucket"}},
	}}
	ec2 := &countingEC2Inventory{stubEC2Inventory: stubEC2Inventory{
		regions: []string{"us-east-1"},
	}}
	lambda := &countingLambdaInventory{}

	service := New(
		settings,
		dataStore,
		discovery.New(settings, func(command string) (string, error) {
			if command == "aws" {
				return "/usr/bin/aws", nil
			}
			return "", nil
		}),
		s3,
		ec2,
		lambda,
		stubDynamoDBInventory{},
		stubSQSInventory{},
		stubSNSInventory{},
		stubRDSInventory{},
		stubECSInventory{},
		stubEKSInventory{},
		stubCloudFormationInventory{},
		stubEventBridgeInventory{},
		stubRoute53Inventory{},
		stubElbv2Inventory{},
		stubKmsInventory{},
		stubApiGatewayInventory{},
		stubSecretsManagerInventory{},
		&stubLogsInventory{},
		&stubIAMInventory{},
		stubAzureInventory{},
		stubDockerRuntime{},
	)
	service.now = func() time.Time { return time.Now().UTC() }

	ctx := context.Background()
	for _, step := range []struct {
		method string
		params []byte
	}{
		{"session.selectProvider", []byte(`{"providerId":"aws"}`)},
		{"session.selectProfile", []byte(`{"providerId":"aws","profileId":"sandbox"}`)},
		{"session.selectAuthMethod", []byte(`{"authMethod":"cli"}`)},
		{"session.lock", nil},
	} {
		if _, err := service.Handle(ctx, step.method, step.params, nil); err != nil {
			t.Fatalf("%s: %v", step.method, err)
		}
	}

	result, err := service.Handle(ctx, "aws.inventory.get", []byte(`{"scope":"s3"}`), nil)
	if err != nil {
		t.Fatalf("aws.inventory.get: %v", err)
	}
	slice, ok := result.(models.AwsInventorySlice)
	if !ok {
		t.Fatalf("expected AwsInventorySlice, got %T", result)
	}
	if s3.listBuckets.Load() == 0 {
		t.Fatal("expected S3 enricher on scoped aws.inventory.get")
	}
	if ec2.listRegions.Load() != 0 {
		t.Fatalf("expected EC2 enricher to be skipped, listRegions=%d", ec2.listRegions.Load())
	}
	if lambda.listFunctions.Load() != 0 {
		t.Fatalf("expected Lambda enricher to be skipped, listFunctions=%d", lambda.listFunctions.Load())
	}
	if slice.ProviderID != "aws" || slice.Scope != "s3" {
		t.Fatalf("unexpected AWS inventory envelope: %+v", slice)
	}
	if slice.Payload.AwsS3InventoryPayload == nil {
		t.Fatal("expected S3 payload on scoped aws.inventory.get")
	}
	if len(slice.Payload.S3Buckets) != 1 {
		t.Fatalf("expected S3 inventory on scoped aws.inventory.get, got %+v", slice.Payload.S3Buckets)
	}
}

func TestAwsInventorySliceJSONIsScopedAndPreservesEmptyArrays(t *testing.T) {
	t.Parallel()

	workspace := models.WorkspaceSnapshot{
		SelectedS3BucketName:            "selected",
		SelectedS3ObjectKey:             "selected",
		S3PrefixFilter:                  "selected",
		S3StatusMessage:                 "status",
		S3ObjectsNextToken:              "next",
		S3ObjectsHasMore:                true,
		SelectedEC2Region:               "selected",
		SelectedEC2InstanceID:           "selected",
		EC2StatusMessage:                "status",
		SelectedLambdaRegion:            "selected",
		SelectedLambdaFunctionName:      "selected",
		LambdaStatusMessage:             "status",
		SelectedDynamoDBRegion:          "selected",
		SelectedDynamoDBTableName:       "selected",
		DynamoDBStatusMessage:           "status",
		SelectedSQSRegion:               "selected",
		SelectedSQSQueueURL:             "selected",
		SQSStatusMessage:                "status",
		SelectedSNSRegion:               "selected",
		SelectedSNSTopicArn:             "selected",
		SNSStatusMessage:                "status",
		SelectedRDSRegion:               "selected",
		SelectedRDSInstanceID:           "selected",
		RDSStatusMessage:                "status",
		SelectedECSRegion:               "selected",
		SelectedECSClusterArn:           "selected",
		SelectedECSServiceArn:           "selected",
		SelectedECSTaskArn:              "selected",
		ECSStatusMessage:                "status",
		SelectedEKSRegion:               "selected",
		SelectedEKSClusterName:          "selected",
		EKSStatusMessage:                "status",
		SelectedCloudFormationRegion:    "selected",
		SelectedCloudFormationStackName: "selected",
		CloudFormationStatusMessage:     "status",
		SelectedEventBridgeRegion:       "selected",
		SelectedEventBridgeBusName:      "selected",
		EventBridgeStatusMessage:        "status",
		SelectedRoute53HostedZoneID:     "selected",
		Route53StatusMessage:            "status",
		SelectedElbRegion:               "selected",
		SelectedElbLoadBalancerArn:      "selected",
		ElbStatusMessage:                "status",
		SelectedKmsRegion:               "selected",
		SelectedKmsKeyId:                "selected",
		KmsStatusMessage:                "status",
		SelectedApiGatewayRegion:        "selected",
		SelectedApiGatewayApiKey:        "selected",
		ApiGatewayStatusMessage:         "status",
		SelectedSecretsManagerRegion:    "selected",
		SelectedSecretsManagerName:      "selected",
		SecretsManagerStatusMessage:     "status",
		SelectedLogsRegion:              "selected",
		SelectedLogGroupName:            "selected",
		LogsStatusMessage:               "status",
		SelectedIAMRoleName:             "selected",
		IAMStatusMessage:                "status",
	}

	tests := []struct {
		scope          string
		keys           []string
		emptyArrayKeys []string
	}{
		{
			scope: "s3",
			keys: []string{
				"selectedS3BucketName", "selectedS3ObjectKey", "s3PrefixFilter",
				"s3StatusMessage", "s3Buckets", "s3Objects", "s3ObjectsNextToken",
				"s3ObjectsHasMore", "s3ObjectMetadata", "s3ExportSnippets",
			},
			emptyArrayKeys: []string{"s3Buckets", "s3Objects", "s3ObjectMetadata", "s3ExportSnippets"},
		},
		{
			scope: "ec2",
			keys: []string{
				"selectedEc2Region", "selectedEc2InstanceId", "ec2StatusMessage",
				"ec2Regions", "ec2Instances",
			},
			emptyArrayKeys: []string{"ec2Regions", "ec2Instances"},
		},
		{
			scope: "lambda",
			keys: []string{
				"selectedLambdaRegion", "selectedLambdaFunctionName", "lambdaStatusMessage",
				"lambdaRegions", "lambdaFunctions",
			},
			emptyArrayKeys: []string{"lambdaRegions", "lambdaFunctions"},
		},
		{
			scope: "dynamodb",
			keys: []string{
				"selectedDynamodbRegion", "selectedDynamodbTableName", "dynamodbStatusMessage",
				"dynamodbRegions", "dynamodbTables",
			},
			emptyArrayKeys: []string{"dynamodbRegions", "dynamodbTables"},
		},
		{
			scope: "sqs",
			keys: []string{
				"selectedSqsRegion", "selectedSqsQueueUrl", "sqsStatusMessage",
				"sqsRegions", "sqsQueues",
			},
			emptyArrayKeys: []string{"sqsRegions", "sqsQueues"},
		},
		{
			scope: "sns",
			keys: []string{
				"selectedSnsRegion", "selectedSnsTopicArn", "snsStatusMessage",
				"snsRegions", "snsTopics",
			},
			emptyArrayKeys: []string{"snsRegions", "snsTopics"},
		},
		{
			scope: "rds",
			keys: []string{
				"selectedRdsRegion", "selectedRdsInstanceId", "rdsStatusMessage",
				"rdsRegions", "rdsInstances",
			},
			emptyArrayKeys: []string{"rdsRegions", "rdsInstances"},
		},
		{
			scope: "ecs",
			keys: []string{
				"selectedEcsRegion", "selectedEcsClusterArn", "selectedEcsServiceArn",
				"selectedEcsTaskArn", "ecsStatusMessage", "ecsRegions", "ecsClusters",
				"ecsServices", "ecsTasks",
			},
			emptyArrayKeys: []string{"ecsRegions", "ecsClusters", "ecsServices", "ecsTasks"},
		},
		{
			scope: "eks",
			keys: []string{
				"selectedEksRegion", "selectedEksClusterName", "eksStatusMessage",
				"eksRegions", "eksClusters", "eksNodeGroups",
			},
			emptyArrayKeys: []string{"eksRegions", "eksClusters", "eksNodeGroups"},
		},
		{
			scope: "cloudformation",
			keys: []string{
				"selectedCloudFormationRegion", "selectedCloudFormationStackName",
				"cloudFormationStatusMessage", "cloudFormationRegions",
				"cloudFormationStacks", "cloudFormationStackEvents",
			},
			emptyArrayKeys: []string{
				"cloudFormationRegions", "cloudFormationStacks", "cloudFormationStackEvents",
			},
		},
		{
			scope: "eventbridge",
			keys: []string{
				"selectedEventBridgeRegion", "selectedEventBridgeBusName",
				"eventBridgeStatusMessage", "eventBridgeRegions",
				"eventBridgeBuses", "eventBridgeRules",
			},
			emptyArrayKeys: []string{"eventBridgeRegions", "eventBridgeBuses", "eventBridgeRules"},
		},
		{
			scope: "route53",
			keys: []string{
				"selectedRoute53HostedZoneId", "route53StatusMessage",
				"route53HostedZones", "route53ResourceRecordSets",
			},
			emptyArrayKeys: []string{"route53HostedZones", "route53ResourceRecordSets"},
		},
		{
			scope: "elb",
			keys: []string{
				"selectedElbRegion", "selectedElbLoadBalancerArn", "elbStatusMessage",
				"elbRegions", "elbLoadBalancers", "elbTargetGroups",
			},
			emptyArrayKeys: []string{"elbRegions", "elbLoadBalancers", "elbTargetGroups"},
		},
		{
			scope: "kms",
			keys: []string{
				"selectedKmsRegion", "selectedKmsKeyId", "kmsStatusMessage",
				"kmsRegions", "kmsKeys", "kmsAliases",
			},
			emptyArrayKeys: []string{"kmsRegions", "kmsKeys", "kmsAliases"},
		},
		{
			scope: "apigateway",
			keys: []string{
				"selectedApiGatewayRegion", "selectedApiGatewayApiKey",
				"apiGatewayStatusMessage", "apiGatewayRegions",
				"apiGatewayApis", "apiGatewayStages",
			},
			emptyArrayKeys: []string{"apiGatewayRegions", "apiGatewayApis", "apiGatewayStages"},
		},
		{
			scope: "secrets",
			keys: []string{
				"selectedSecretsManagerRegion", "selectedSecretsManagerName",
				"secretsManagerStatusMessage", "secretsManagerRegions",
				"secretsManagerSecrets",
			},
			emptyArrayKeys: []string{"secretsManagerRegions", "secretsManagerSecrets"},
		},
		{
			scope: "logs",
			keys: []string{
				"selectedLogsRegion", "selectedLogGroupName", "logsStatusMessage",
				"logsRegions", "logGroups",
			},
			emptyArrayKeys: []string{"logsRegions", "logGroups"},
		},
		{
			scope: "iam",
			keys: []string{
				"selectedIamRoleName", "iamStatusMessage", "iamRoles", "iamPolicies",
			},
			emptyArrayKeys: []string{"iamRoles", "iamPolicies"},
		},
	}

	catalogueScopes := awsInventoryScopesFromCatalog()
	if len(tests) != len(catalogueScopes) {
		t.Fatalf("scope fixtures: got %d, catalogue has %d", len(tests), len(catalogueScopes))
	}

	for _, tt := range tests {
		t.Run(tt.scope, func(t *testing.T) {
			if _, ok := catalogueScopes[tt.scope]; !ok {
				t.Fatalf("scope %q is not present in the AWS service catalogue", tt.scope)
			}
			slice, err := appaws.InventorySliceFromWorkspace(tt.scope, workspace)
			if err != nil {
				t.Fatalf("InventorySliceFromWorkspace: %v", err)
			}
			encoded, err := json.Marshal(slice)
			if err != nil {
				t.Fatalf("json.Marshal: %v", err)
			}

			var envelope map[string]json.RawMessage
			if err := json.Unmarshal(encoded, &envelope); err != nil {
				t.Fatalf("json.Unmarshal envelope: %v", err)
			}
			if len(envelope) != 3 {
				t.Fatalf("envelope keys = %v, want providerId, scope, payload", envelope)
			}
			for _, key := range []string{"providerId", "scope", "payload"} {
				if _, ok := envelope[key]; !ok {
					t.Fatalf("envelope is missing %q: %s", key, encoded)
				}
			}

			var providerID string
			if err := json.Unmarshal(envelope["providerId"], &providerID); err != nil {
				t.Fatalf("json.Unmarshal providerId: %v", err)
			}
			if providerID != "aws" {
				t.Fatalf("providerId = %q, want aws", providerID)
			}
			var scope string
			if err := json.Unmarshal(envelope["scope"], &scope); err != nil {
				t.Fatalf("json.Unmarshal scope: %v", err)
			}
			if scope != tt.scope {
				t.Fatalf("scope = %q, want %q", scope, tt.scope)
			}

			var payload map[string]json.RawMessage
			if err := json.Unmarshal(envelope["payload"], &payload); err != nil {
				t.Fatalf("json.Unmarshal payload: %v", err)
			}
			if len(payload) != len(tt.keys) {
				t.Fatalf("payload keys = %v, want exactly %v", payload, tt.keys)
			}
			for _, key := range tt.keys {
				if _, ok := payload[key]; !ok {
					t.Fatalf("payload is missing %q: %s", key, envelope["payload"])
				}
			}
			for _, key := range tt.emptyArrayKeys {
				if got := string(payload[key]); got != "[]" {
					t.Fatalf("%s = %s, want []", key, got)
				}
			}
		})
	}
}

func TestBuildWorkspaceSnapshotParallelNoRace(t *testing.T) {
	service, s3, ec2, lambda := awsTestService(t)

	snapshot := discovery.Snapshot{
		Providers: []models.ProviderSummary{{ProviderID: "aws", Label: "AWS"}},
		Profiles:  []models.ProfileSummary{{ProviderID: "aws", ProfileID: "sandbox", DisplayName: "sandbox"}},
	}
	session := models.SessionSnapshot{
		CurrentProviderID: "aws",
		SelectedProfileID: "sandbox",
		IsLocked:          true,
	}

	workspace := service.buildWorkspaceSnapshotOpts(context.Background(), snapshot, session, workspaceSnapshotOptions{})
	if s3.listBuckets.Load() == 0 || ec2.listInstances.Load() == 0 || lambda.listFunctions.Load() == 0 {
		t.Fatalf(
			"expected parallel full enrichment, s3=%d ec2Instances=%d lambda=%d",
			s3.listBuckets.Load(),
			ec2.listInstances.Load(),
			lambda.listFunctions.Load(),
		)
	}
	if len(workspace.S3Buckets) != 1 || len(workspace.EC2Instances) != 1 {
		t.Fatalf("expected populated AWS inventories, buckets=%+v instances=%+v", workspace.S3Buckets, workspace.EC2Instances)
	}
}
