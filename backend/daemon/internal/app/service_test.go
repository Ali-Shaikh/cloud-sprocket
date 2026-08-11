// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	appruntime "cloudsprocket/backend/daemon/internal/app/runtime"
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

type stubAzureInventory struct {
	resourceGroups  []models.AzureResourceGroup
	virtualMachines map[string][]models.AzureVirtualMachine
}

type stubDockerRuntime struct {
	snapshot  models.DockerRuntimeSnapshot
	resources []models.ManagedDockerResource
}

type stubLambdaInventory struct{}

func (stubLambdaInventory) ListFunctions(context.Context, models.ProfileSummary, string) ([]models.AwsLambdaFunction, error) {
	return nil, nil
}

func (stubLambdaInventory) DescribeFunction(context.Context, models.ProfileSummary, string, string) (models.AwsLambdaFunction, error) {
	return models.AwsLambdaFunction{}, nil
}

func (stubLambdaInventory) InvokeFunction(context.Context, models.ProfileSummary, string, string, []byte) (models.AwsLambdaInvokeResult, error) {
	return models.AwsLambdaInvokeResult{StatusCode: 200, Payload: "{}"}, nil
}

func (stubLambdaInventory) CreateFunction(context.Context, models.ProfileSummary, string, models.AwsLambdaCreateInput) (models.AwsLambdaFunction, error) {
	return models.AwsLambdaFunction{FunctionName: "created-fn", Runtime: "nodejs20.x", State: "Active"}, nil
}

func (stubLambdaInventory) DeleteFunction(context.Context, models.ProfileSummary, string, string) (models.AwsLambdaDeleteFunctionResult, error) {
	return models.AwsLambdaDeleteFunctionResult{FunctionName: "deleted-fn", Summary: "Deleted Lambda function deleted-fn."}, nil
}

type stubDynamoDBInventory struct{}

func (stubDynamoDBInventory) ListTables(context.Context, models.ProfileSummary, string) ([]models.AwsDynamoDBTable, error) {
	return nil, nil
}

func (stubDynamoDBInventory) DescribeTable(context.Context, models.ProfileSummary, string, string) (models.AwsDynamoDBTable, error) {
	return models.AwsDynamoDBTable{}, nil
}

func (stubDynamoDBInventory) GetItem(context.Context, models.ProfileSummary, string, string, string) (map[string]any, bool, error) {
	return nil, false, nil
}

func (stubDynamoDBInventory) PutItem(context.Context, models.ProfileSummary, string, string, string) (models.AwsDynamoDBWriteResult, error) {
	return models.AwsDynamoDBWriteResult{}, nil
}

func (stubDynamoDBInventory) DeleteItem(context.Context, models.ProfileSummary, string, string, string) (models.AwsDynamoDBWriteResult, error) {
	return models.AwsDynamoDBWriteResult{}, nil
}

func (stubDynamoDBInventory) ScanSampleItems(context.Context, models.ProfileSummary, string, string, string, int32) (models.AwsDynamoDBScanPage, error) {
	return models.AwsDynamoDBScanPage{}, nil
}

type stubSQSInventory struct{}

func (stubSQSInventory) ListQueues(context.Context, models.ProfileSummary, string) ([]models.AwsSqsQueue, error) {
	return nil, nil
}

func (stubSQSInventory) DescribeQueue(context.Context, models.ProfileSummary, string, string) (models.AwsSqsQueue, error) {
	return models.AwsSqsQueue{}, nil
}

func (stubSQSInventory) PeekMessages(context.Context, models.ProfileSummary, string, string) (models.AwsSqsPeekResult, error) {
	return models.AwsSqsPeekResult{}, nil
}

func (stubSQSInventory) SendMessage(context.Context, models.ProfileSummary, string, string, string) (models.AwsSqsSendResult, error) {
	return models.AwsSqsSendResult{}, nil
}

func (stubSQSInventory) CreateQueue(context.Context, models.ProfileSummary, string, string) (models.AwsSqsCreateQueueResult, error) {
	return models.AwsSqsCreateQueueResult{}, nil
}

func (stubSQSInventory) PurgeQueue(context.Context, models.ProfileSummary, string, string) (models.AwsSqsPurgeResult, error) {
	return models.AwsSqsPurgeResult{}, nil
}

type stubSNSInventory struct{}

func (stubSNSInventory) ListTopics(context.Context, models.ProfileSummary, string) ([]models.AwsSnsTopic, error) {
	return nil, nil
}

func (stubSNSInventory) DescribeTopic(context.Context, models.ProfileSummary, string, string) (models.AwsSnsTopic, error) {
	return models.AwsSnsTopic{}, nil
}

func (stubSNSInventory) Publish(context.Context, models.ProfileSummary, string, string, string) (models.AwsSnsPublishResult, error) {
	return models.AwsSnsPublishResult{}, nil
}

func (stubSNSInventory) CreateTopic(context.Context, models.ProfileSummary, string, string) (models.AwsSnsCreateTopicResult, error) {
	return models.AwsSnsCreateTopicResult{}, nil
}

func (stubSNSInventory) CreateSubscription(context.Context, models.ProfileSummary, string, string, string, string) (models.AwsSnsCreateSubscriptionResult, error) {
	return models.AwsSnsCreateSubscriptionResult{}, nil
}

type stubRDSInventory struct{}

func (stubRDSInventory) ListInstances(context.Context, models.ProfileSummary, string) ([]models.AwsRdsInstance, error) {
	return nil, nil
}

func (stubRDSInventory) DescribeInstance(context.Context, models.ProfileSummary, string, string) (models.AwsRdsInstance, error) {
	return models.AwsRdsInstance{}, nil
}

func (stubRDSInventory) StartDBInstance(context.Context, models.ProfileSummary, string, string) error {
	return nil
}

func (stubRDSInventory) StopDBInstance(context.Context, models.ProfileSummary, string, string) error {
	return nil
}

func (stubRDSInventory) RebootDBInstance(context.Context, models.ProfileSummary, string, string) error {
	return nil
}

type stubECSInventory struct{}

func (stubECSInventory) ListClusters(context.Context, models.ProfileSummary, string) ([]models.AwsEcsCluster, error) {
	return nil, nil
}

func (stubECSInventory) DescribeCluster(context.Context, models.ProfileSummary, string, string) (models.AwsEcsCluster, error) {
	return models.AwsEcsCluster{}, nil
}

func (stubECSInventory) ListServices(context.Context, models.ProfileSummary, string, string) ([]models.AwsEcsService, error) {
	return nil, nil
}

func (stubECSInventory) ListTasks(context.Context, models.ProfileSummary, string, string, string) ([]models.AwsEcsTask, error) {
	return nil, nil
}

func (stubECSInventory) DescribeTask(context.Context, models.ProfileSummary, string, string, string) (models.AwsEcsTask, error) {
	return models.AwsEcsTask{}, nil
}

func (stubECSInventory) ForceNewDeployment(context.Context, models.ProfileSummary, string, string, string) (models.AwsEcsForceNewDeploymentResult, error) {
	return models.AwsEcsForceNewDeploymentResult{
		ServiceName: "web",
		Summary:     "Forced a new deployment for ECS service web.",
	}, nil
}

func (stubECSInventory) UpdateDesiredCount(context.Context, models.ProfileSummary, string, string, string, int32) (models.AwsEcsUpdateDesiredCountResult, error) {
	return models.AwsEcsUpdateDesiredCountResult{
		ServiceName:  "web",
		DesiredCount: 2,
		Summary:      "Set desired count for ECS service web to 2.",
	}, nil
}

type stubEKSInventory struct{}

func (stubEKSInventory) ListClusters(context.Context, models.ProfileSummary, string) ([]models.AwsEksCluster, error) {
	return nil, nil
}

func (stubEKSInventory) DescribeCluster(context.Context, models.ProfileSummary, string, string) (models.AwsEksCluster, error) {
	return models.AwsEksCluster{}, nil
}

func (stubEKSInventory) ListNodeGroups(context.Context, models.ProfileSummary, string, string) ([]models.AwsEksNodeGroup, error) {
	return nil, nil
}

type stubCloudFormationInventory struct{}

func (stubCloudFormationInventory) DescribeStacks(context.Context, models.ProfileSummary, string) ([]models.AwsCloudFormationStack, error) {
	return nil, nil
}

func (stubCloudFormationInventory) DescribeStackEvents(context.Context, models.ProfileSummary, string, string) ([]models.AwsCloudFormationStackEvent, error) {
	return nil, nil
}

type stubEventBridgeInventory struct{}

func (stubEventBridgeInventory) ListEventBuses(context.Context, models.ProfileSummary, string) ([]models.AwsEventBridgeBus, error) {
	return nil, nil
}

func (stubEventBridgeInventory) ListRules(context.Context, models.ProfileSummary, string, string) ([]models.AwsEventBridgeRule, error) {
	return nil, nil
}

type stubRoute53Inventory struct{}

func (stubRoute53Inventory) ListHostedZones(context.Context, models.ProfileSummary) ([]models.AwsRoute53HostedZone, error) {
	return nil, nil
}

func (stubRoute53Inventory) ListResourceRecordSets(context.Context, models.ProfileSummary, string) ([]models.AwsRoute53ResourceRecordSet, error) {
	return nil, nil
}

type stubElbv2Inventory struct{}

func (stubElbv2Inventory) DescribeLoadBalancers(context.Context, models.ProfileSummary, string) ([]models.AwsElbLoadBalancer, error) {
	return nil, nil
}

func (stubElbv2Inventory) DescribeTargetGroups(context.Context, models.ProfileSummary, string, string) ([]models.AwsElbTargetGroup, error) {
	return nil, nil
}

type stubKmsInventory struct{}

func (stubKmsInventory) ListKeys(context.Context, models.ProfileSummary, string) ([]models.AwsKmsKey, error) {
	return nil, nil
}

func (stubKmsInventory) ListAliases(context.Context, models.ProfileSummary, string) ([]models.AwsKmsAlias, error) {
	return nil, nil
}

func (stubKmsInventory) DescribeKey(context.Context, models.ProfileSummary, string, string) (models.AwsKmsKey, error) {
	return models.AwsKmsKey{}, nil
}

type stubApiGatewayInventory struct{}

func (stubApiGatewayInventory) ListApis(context.Context, models.ProfileSummary, string) (models.AwsApiGatewayListResult, error) {
	return models.AwsApiGatewayListResult{}, nil
}

func (stubApiGatewayInventory) ListStages(context.Context, models.ProfileSummary, string, string) ([]models.AwsApiGatewayStage, error) {
	return nil, nil
}

type stubSecretsManagerInventory struct{}

func (stubSecretsManagerInventory) ListSecrets(context.Context, models.ProfileSummary, string) ([]models.AwsSecretsManagerSecret, error) {
	return nil, nil
}

func (stubSecretsManagerInventory) GetSecretValue(context.Context, models.ProfileSummary, string, string) (string, error) {
	return "", nil
}

type stubLogsInventory struct {
	groups map[string][]models.AwsLogGroup
}

func (s *stubLogsInventory) ListLogGroups(_ context.Context, _ models.ProfileSummary, region string) ([]models.AwsLogGroup, error) {
	if s.groups == nil {
		return nil, nil
	}
	return append([]models.AwsLogGroup(nil), s.groups[region]...), nil
}

func (stubLogsInventory) DescribeLogGroup(context.Context, models.ProfileSummary, string, string) (models.AwsLogGroup, error) {
	return models.AwsLogGroup{}, nil
}

func (s *stubLogsInventory) CreateLogGroup(_ context.Context, _ models.ProfileSummary, region string, logGroupName string) (models.AwsLogsCreateLogGroupResult, error) {
	if s.groups == nil {
		s.groups = map[string][]models.AwsLogGroup{}
	}
	if region == "" {
		region = "us-east-1"
	}
	s.groups[region] = append(s.groups[region], models.AwsLogGroup{LogGroupName: logGroupName})
	return models.AwsLogsCreateLogGroupResult{LogGroupName: logGroupName, Region: region}, nil
}

func (stubLogsInventory) PutLogEvents(context.Context, models.ProfileSummary, string, string, string) (models.AwsLogsPutLogEventsResult, error) {
	return models.AwsLogsPutLogEventsResult{
		LogGroupName:  "/aws/test/group",
		LogStreamName: "cloudsprocket-test",
		Summary:       "Injected test event.",
	}, nil
}

func (stubLogsInventory) FilterEvents(_ context.Context, _ models.ProfileSummary, _ string, logGroupName string, filterPattern string, _ int) (models.AwsLogsFilterEventsResult, error) {
	return models.AwsLogsFilterEventsResult{
		LogGroupName:  logGroupName,
		FilterPattern: filterPattern,
		Events:        []string{"2024-06-15 12:00:00 stub event"},
		Summary:       "Found 1 recent event(s).",
	}, nil
}

type stubIAMInventory struct {
	roles map[string][]models.AwsIamRole
}

func (s *stubIAMInventory) ListRoles(_ context.Context, _ models.ProfileSummary, region string) ([]models.AwsIamRole, error) {
	if s.roles == nil {
		return nil, nil
	}
	return append([]models.AwsIamRole(nil), s.roles[region]...), nil
}

func (stubIAMInventory) DescribeRole(context.Context, models.ProfileSummary, string, string) (models.AwsIamRole, error) {
	return models.AwsIamRole{}, nil
}

func (stubIAMInventory) ListPolicies(context.Context, models.ProfileSummary, string) ([]models.AwsIamPolicy, error) {
	return nil, nil
}

func (s *stubIAMInventory) CreateRole(_ context.Context, _ models.ProfileSummary, region string, roleName string) (models.AwsIamCreateRoleResult, error) {
	if s.roles == nil {
		s.roles = map[string][]models.AwsIamRole{}
	}
	if region == "" {
		region = "us-east-1"
	}
	s.roles[region] = append(s.roles[region], models.AwsIamRole{RoleName: roleName})
	return models.AwsIamCreateRoleResult{
		RoleName: roleName,
		RoleArn:  "arn:aws:iam::000000000000:role/" + roleName,
	}, nil
}

func (s *stubS3Inventory) ListBuckets(context.Context, models.ProfileSummary) ([]models.AwsS3Bucket, error) {
	return append([]models.AwsS3Bucket(nil), s.buckets...), nil
}

func (s *stubS3Inventory) ListObjects(_ context.Context, _ models.ProfileSummary, bucketName string, prefix string, continuationToken string) (models.AwsS3ObjectListPage, error) {
	objects := append([]models.AwsS3Object(nil), s.objects[bucketName]...)
	if prefix == "" {
		return models.AwsS3ObjectListPage{Entries: objects}, nil
	}
	filtered := []models.AwsS3Object{}
	for _, object := range objects {
		if len(object.Key) >= len(prefix) && object.Key[:len(prefix)] == prefix {
			filtered = append(filtered, object)
		}
	}
	_ = continuationToken
	return models.AwsS3ObjectListPage{Entries: filtered}, nil
}

func (s stubS3Inventory) HeadObject(_ context.Context, _ models.ProfileSummary, bucketName string, objectKey string) ([]models.DetailField, error) {
	return append([]models.DetailField(nil), s.metadata[bucketName+"|"+objectKey]...), nil
}

func (stubS3Inventory) GetObject(_ context.Context, _ models.ProfileSummary, _ string, _ string) (string, error) {
	return "", nil
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

func (s *stubS3Inventory) DeleteObject(_ context.Context, _ models.ProfileSummary, bucketName string, objectKey string) (models.AwsS3DeleteObjectResult, error) {
	if objs, ok := s.objects[bucketName]; ok {
		filtered := []models.AwsS3Object{}
		for _, o := range objs {
			if o.Key != objectKey {
				filtered = append(filtered, o)
			}
		}
		s.objects[bucketName] = filtered
	}
	return models.AwsS3DeleteObjectResult{BucketName: bucketName, ObjectKey: objectKey, Summary: "Deleted object " + objectKey + "."}, nil
}

func (s *stubS3Inventory) CreateBucket(_ context.Context, _ models.ProfileSummary, bucketName string, region string) (models.AwsS3CreateBucketResult, error) {
	for _, b := range s.buckets {
		if b.Name == bucketName {
			return models.AwsS3CreateBucketResult{BucketName: bucketName, Region: region}, nil
		}
	}
	s.buckets = append(s.buckets, models.AwsS3Bucket{Name: bucketName})
	return models.AwsS3CreateBucketResult{BucketName: bucketName, Region: region}, nil
}

func (stubS3Inventory) CopyObject(_ context.Context, _ models.ProfileSummary, bucketName string, sourceObjectKey string, destinationObjectKey string) (models.AwsS3CopyObjectResult, error) {
	return models.AwsS3CopyObjectResult{
		BucketName:           bucketName,
		SourceObjectKey:      sourceObjectKey,
		DestinationObjectKey: destinationObjectKey,
		DestinationURI:       "s3://" + bucketName + "/" + destinationObjectKey,
	}, nil
}

func (stubS3Inventory) CreateFolderPrefix(_ context.Context, _ models.ProfileSummary, bucketName string, folderPrefix string) (models.AwsS3CreateFolderPrefixResult, error) {
	return models.AwsS3CreateFolderPrefixResult{BucketName: bucketName, FolderPrefix: folderPrefix}, nil
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

func (s *stubEC2Inventory) RunInstances(_ context.Context, _ models.ProfileSummary, region string, instanceType string) (models.AwsEc2RunInstancesResult, error) {
	id := "i-launched00001"
	if s.instances == nil {
		s.instances = map[string][]models.AwsEc2Instance{}
	}
	s.instances[region] = append(s.instances[region], models.AwsEc2Instance{InstanceID: id, State: "running"})
	return models.AwsEc2RunInstancesResult{InstanceID: id, Region: region, InstanceType: instanceType, Summary: "Launched EC2 instance " + id + "."}, nil
}

func (stubEC2Inventory) TerminateInstances(_ context.Context, _ models.ProfileSummary, _ string, instanceID string) error {
	return nil
}

func (s *stubEC2Inventory) RebootInstance(_ context.Context, _ models.ProfileSummary, region string, instanceID string) error {
	s.actionRequests = append(s.actionRequests, "reboot|"+region+"|"+instanceID)
	return s.actionErrors["reboot"]
}

func (s stubAzureInventory) ListResourceGroups(context.Context, models.ProfileSummary) ([]models.AzureResourceGroup, error) {
	return append([]models.AzureResourceGroup(nil), s.resourceGroups...), nil
}

func (s stubAzureInventory) ListVirtualMachines(_ context.Context, _ models.ProfileSummary, resourceGroup string) ([]models.AzureVirtualMachine, error) {
	return append([]models.AzureVirtualMachine(nil), s.virtualMachines[resourceGroup]...), nil
}

func (stubAzureInventory) CreateResourceGroup(context.Context, models.ProfileSummary, string, string) (models.AzureResourceGroup, error) {
	return models.AzureResourceGroup{Name: "created-rg", Location: "westeurope", ProvisioningState: "Succeeded"}, nil
}

func (stubAzureInventory) DeleteResourceGroup(context.Context, models.ProfileSummary, string) error {
	return nil
}

func (stubAzureInventory) ListStorageAccounts(context.Context, models.ProfileSummary) ([]models.AzureStorageAccount, error) {
	return []models.AzureStorageAccount{{Name: "devstoreaccount1", BlobEndpoint: "http://localhost:4577/devstoreaccount1"}}, nil
}

func (stubAzureInventory) ListBlobContainers(context.Context, models.ProfileSummary, string) ([]models.AzureBlobContainer, error) {
	return []models.AzureBlobContainer{{Name: "test-container"}}, nil
}

func (stubAzureInventory) ListBlobs(context.Context, models.ProfileSummary, string, string, string) ([]models.AzureBlob, error) {
	return []models.AzureBlob{{Name: "sample.txt", Size: "12 B"}}, nil
}

func (stubAzureInventory) CreateStorageAccount(context.Context, models.ProfileSummary, string, string, string) (models.AzureStorageAccount, error) {
	return models.AzureStorageAccount{Name: "newaccount", Location: "westeurope"}, nil
}

func (stubAzureInventory) CreateBlobContainer(context.Context, models.ProfileSummary, string, string) error {
	return nil
}

func (stubAzureInventory) UploadBlob(context.Context, models.ProfileSummary, string, string, string, string) (models.AzureBlobUploadResult, error) {
	return models.AzureBlobUploadResult{AccountName: "devstoreaccount1", ContainerName: "test-container", BlobName: "sample.txt"}, nil
}

func (stubAzureInventory) DeleteBlob(context.Context, models.ProfileSummary, string, string, string) error {
	return nil
}

func (stubAzureInventory) CopyBlob(_ context.Context, _ models.ProfileSummary, accountName string, containerName string, sourceBlobName string, destinationBlobName string) (models.AzureBlobCopyResult, error) {
	return models.AzureBlobCopyResult{
		AccountName:         accountName,
		ContainerName:       containerName,
		SourceBlobName:      sourceBlobName,
		DestinationBlobName: destinationBlobName,
		BlobURL:             "https://example.invalid/" + containerName + "/" + destinationBlobName,
	}, nil
}

func (stubAzureInventory) CreateFolderPrefix(_ context.Context, _ models.ProfileSummary, accountName string, containerName string, folderPrefix string) (models.AzureBlobCreateFolderPrefixResult, error) {
	return models.AzureBlobCreateFolderPrefixResult{
		AccountName:   accountName,
		ContainerName: containerName,
		FolderPrefix:  folderPrefix,
	}, nil
}

func (stubAzureInventory) PresignBlob(_ context.Context, _ models.ProfileSummary, accountName string, containerName string, blobName string, durationSeconds int) (models.AzureBlobPresignResult, error) {
	if durationSeconds <= 0 {
		durationSeconds = 3600
	}
	return models.AzureBlobPresignResult{
		AccountName:     accountName,
		ContainerName:   containerName,
		BlobName:        blobName,
		URL:             "https://example.invalid/" + containerName + "/" + blobName + "?sig=mock",
		DurationSeconds: durationSeconds,
		ExpiresAt:       "2026-08-05T12:00:00Z",
	}, nil
}

func (stubAzureInventory) InvokeVirtualMachineAction(context.Context, models.ProfileSummary, string, string, string) error {
	return nil
}

func (stubAzureInventory) GetVirtualMachine(_ context.Context, _ models.ProfileSummary, resourceGroup string, vmName string) (models.AzureVirtualMachine, error) {
	return models.AzureVirtualMachine{VMID: vmName, Name: vmName, ResourceGroup: resourceGroup}, nil
}

func (stubAzureInventory) ListWebApps(context.Context, models.ProfileSummary, string) ([]models.AzureWebApp, error) {
	return []models.AzureWebApp{{Name: "demo-app", ResourceGroup: "demo-rg", State: "Running"}}, nil
}

func (stubAzureInventory) GetWebApp(_ context.Context, _ models.ProfileSummary, resourceGroup string, appName string, _ string) (models.AzureWebApp, error) {
	return models.AzureWebApp{
		Name:           appName,
		ResourceGroup:  resourceGroup,
		State:          "Running",
		AppServicePlan: "demo-plan",
		PlanSKU:        "F1 (Free)",
		Runtime:        "NODE:22-lts",
	}, nil
}

func (stubAzureInventory) CreateWebAppDeploymentSlot(context.Context, models.ProfileSummary, string, string, string) error {
	return nil
}

func (stubAzureInventory) SwapWebAppDeploymentSlots(context.Context, models.ProfileSummary, string, string, string) error {
	return nil
}

func (stubAzureInventory) ListAppServicePlans(context.Context, models.ProfileSummary, string) ([]models.AzureAppServicePlan, error) {
	return []models.AzureAppServicePlan{{Name: "demo-plan", SKU: "F1 (Free)", Status: "Ready"}}, nil
}

func (stubAzureInventory) GetAppServicePlan(_ context.Context, _ models.ProfileSummary, resourceGroup string, planName string) (models.AzureAppServicePlan, error) {
	return models.AzureAppServicePlan{
		Name:          planName,
		ResourceGroup: resourceGroup,
		SKU:           "P1v3 (PremiumV3)",
		Status:        "Ready",
	}, nil
}

func (stubAzureInventory) ListWebAppDeploymentSlots(context.Context, models.ProfileSummary, string, string) ([]models.AzureWebAppDeploymentSlot, error) {
	return []models.AzureWebAppDeploymentSlot{{Name: "staging", Status: "Ready", DefaultHostName: "demo-staging.azurewebsites.net"}}, nil
}

func (stubAzureInventory) ListWebAppSettings(context.Context, models.ProfileSummary, string, string, string) ([]models.AzureWebAppSetting, error) {
	return []models.AzureWebAppSetting{{Name: "WEBSITE_NODE_DEFAULT_VERSION", Value: "~22"}}, nil
}

func (stubAzureInventory) SetWebAppSetting(context.Context, models.ProfileSummary, string, string, string, string, bool, string) error {
	return nil
}

func (stubAzureInventory) DeleteWebAppSetting(context.Context, models.ProfileSummary, string, string, string, string) error {
	return nil
}

func (stubAzureInventory) InvokeWebAppAction(context.Context, models.ProfileSummary, string, string, string, string) error {
	return nil
}

func (stubAzureInventory) CreateWebApp(context.Context, models.ProfileSummary, string, string, string, string, string, string, string) (models.AzureWebApp, error) {
	return models.AzureWebApp{Name: "demo-app", ResourceGroup: "demo-rg", State: "Running"}, nil
}

func (stubAzureInventory) ListLogAnalyticsWorkspaces(context.Context, models.ProfileSummary) ([]models.AzureLogAnalyticsWorkspace, error) {
	return []models.AzureLogAnalyticsWorkspace{{Name: "demo-law", ResourceGroup: "demo-rg", CustomerID: "demo-guid"}}, nil
}

func (stubAzureInventory) RunLogAnalyticsQuery(context.Context, models.ProfileSummary, string, string, string, int) (models.AzureLogQueryResult, error) {
	return models.AzureLogQueryResult{Columns: []string{"Level", "Count"}, Rows: [][]string{{"Info", "1"}}, DurationMs: 12}, nil
}

func (stubAzureInventory) ListLogAnalyticsTables(context.Context, models.ProfileSummary, string, string, string, bool) ([]models.AzureLogAnalyticsTableInfo, error) {
	return []models.AzureLogAnalyticsTableInfo{{Name: "AzureDiagnostics", Columns: []string{"Category", "action_s"}}}, nil
}

func (stubAzureInventory) GetLogAnalyticsTableSchema(context.Context, models.ProfileSummary, string, string) ([]string, error) {
	return []string{"TimeGenerated", "Category"}, nil
}

func (stubAzureInventory) DetectWafLogSchema(context.Context, models.ProfileSummary, string, string) (models.AzureWafLogSchemaProfile, error) {
	return models.AzureWafLogSchemaProfile{
		Mode:       "azureDiagnostics",
		TableName:  "AzureDiagnostics",
		Detected:   true,
		Categories: []string{"FrontDoorWebApplicationFirewallLog"},
		Columns: models.AzureWafLogColumnMap{
			Action: "action_s", RuleName: "ruleName_s", TrackingReference: "trackingReference_s",
		},
	}, nil
}

func (stubAzureInventory) ListWafPolicies(context.Context, models.ProfileSummary, bool) ([]models.AzureWafPolicySummary, error) {
	return []models.AzureWafPolicySummary{{Name: "demo-waf", ResourceGroup: "demo-rg", Mode: "Prevention", Enabled: true}}, nil
}

func (stubAzureInventory) GetWafPolicy(context.Context, models.ProfileSummary, string, string) (models.AzureWafPolicyDetail, error) {
	return models.AzureWafPolicyDetail{Name: "demo-waf", ResourceGroup: "demo-rg", Mode: "Prevention", Enabled: true}, nil
}

func (stubAzureInventory) UpdateWafPolicyMode(context.Context, models.ProfileSummary, string, string, string) error {
	return nil
}

func (stubAzureInventory) SetWafManagedRuleOverride(context.Context, models.ProfileSummary, string, string, string, string, string, string, bool) error {
	return nil
}

func (stubAzureInventory) AddWafExclusion(context.Context, models.ProfileSummary, string, string, models.AzureWafExclusion) error {
	return nil
}

func (stubAzureInventory) RemoveWafExclusion(context.Context, models.ProfileSummary, string, string, models.AzureWafExclusion) error {
	return nil
}

func (stubAzureInventory) ListFrontDoorProfiles(context.Context, models.ProfileSummary, bool) ([]models.AzureFrontDoorProfile, error) {
	return []models.AzureFrontDoorProfile{{
		Name:                   "demo-afd",
		ResourceGroup:          "demo-rg",
		SKU:                    "Standard_AzureFrontDoor",
		WafPolicyName:          "demo-waf",
		WafPolicyResourceGroup: "demo-rg",
	}}, nil
}

func (stubAzureInventory) ListFrontDoorEndpoints(context.Context, models.ProfileSummary, string, string) ([]models.AzureFrontDoorEndpoint, error) {
	return []models.AzureFrontDoorEndpoint{{Name: "api", ProfileName: "demo-afd", ResourceGroup: "demo-rg", HostName: "api.azureedge.net", EnabledState: "Enabled"}}, nil
}

func (stubAzureInventory) ListFrontDoorOriginGroups(context.Context, models.ProfileSummary, string, string) ([]models.AzureFrontDoorOriginGroup, error) {
	return []models.AzureFrontDoorOriginGroup{{Name: "default", ProfileName: "demo-afd", ResourceGroup: "demo-rg", HealthProbe: "/health"}}, nil
}

func (stubAzureInventory) ListFrontDoorOrigins(context.Context, models.ProfileSummary, string, string, string) ([]models.AzureFrontDoorOrigin, error) {
	return []models.AzureFrontDoorOrigin{{Name: "origin-app", OriginGroupName: "default", HostName: "app.internal", EnabledState: "Enabled", Priority: 1, Weight: 1000}}, nil
}

func (stubAzureInventory) PurgeFrontDoorEndpointCache(context.Context, models.ProfileSummary, string, string, string, []string, []string) error {
	return nil
}

func (stubAzureInventory) ListFunctionApps(context.Context, models.ProfileSummary) ([]models.AzureFunctionApp, error) {
	return []models.AzureFunctionApp{{Name: "demo-fn", ResourceGroup: "demo-rg", State: "Running"}}, nil
}

func (stubAzureInventory) ListFunctions(context.Context, models.ProfileSummary, string, string) ([]models.AzureFunction, error) {
	return []models.AzureFunction{{Name: "createOrder", Trigger: "httpTrigger"}}, nil
}

func (stubAzureInventory) InvokeFunction(context.Context, models.ProfileSummary, string, string, string, string) (models.AzureFunctionInvokeResult, error) {
	return models.AzureFunctionInvokeResult{StatusCode: 200, Body: "ok"}, nil
}

func (stubAzureInventory) ListKeyVaults(context.Context, models.ProfileSummary) ([]models.AzureKeyVault, error) {
	return []models.AzureKeyVault{{Name: "demo-vault", ResourceGroup: "demo-rg"}}, nil
}

func (stubAzureInventory) ListKeyVaultSecrets(context.Context, models.ProfileSummary, string) ([]models.AzureKeyVaultSecret, error) {
	return []models.AzureKeyVaultSecret{{Name: "db-password", Enabled: true}}, nil
}

func (stubAzureInventory) GetKeyVaultSecret(context.Context, models.ProfileSummary, string, string) (string, error) {
	return "secret-value", nil
}

func (stubAzureInventory) SetKeyVaultSecret(context.Context, models.ProfileSummary, string, string, string) (models.AzureKeyVaultSecret, error) {
	return models.AzureKeyVaultSecret{Name: "db-password", Enabled: true}, nil
}

func (stubAzureInventory) ListCosmosAccounts(context.Context, models.ProfileSummary) ([]models.AzureCosmosAccount, error) {
	return []models.AzureCosmosAccount{{Name: "devstoreaccount1"}}, nil
}

func (stubAzureInventory) ListCosmosDatabases(context.Context, models.ProfileSummary, string, string) ([]models.AzureCosmosDatabase, error) {
	return []models.AzureCosmosDatabase{{Name: "appdb"}}, nil
}

func (stubAzureInventory) ListCosmosContainers(context.Context, models.ProfileSummary, string, string, string) ([]models.AzureCosmosContainer, error) {
	return []models.AzureCosmosContainer{{Name: "orders", PartitionKey: "/customerId"}}, nil
}

func (stubAzureInventory) ListCosmosItems(context.Context, models.ProfileSummary, string, string, string, string) ([]models.AzureCosmosItem, error) {
	return []models.AzureCosmosItem{{ID: "doc-1", JSON: `{"id":"doc-1"}`}}, nil
}

func (stubAzureInventory) DeleteCosmosItem(context.Context, models.ProfileSummary, string, string, string, string, string, string) (models.AzureCosmosDeleteItemResult, error) {
	return models.AzureCosmosDeleteItemResult{Summary: "deleted"}, nil
}

func (stubAzureInventory) ListPostgresServers(context.Context, models.ProfileSummary) ([]models.AzurePostgresServer, error) {
	return []models.AzurePostgresServer{{
		Name:               "lab-dev-pg",
		ResourceGroup:      "demo-rg",
		Location:           "westeurope",
		Version:            "17",
		AdministratorLogin: "psqladmin",
		SKU:                "B_Standard_B1ms",
		StorageMB:          32768,
		ProvisioningState:  "Ready",
		FQDN:               "localhost",
	}}, nil
}

func (stubAzureInventory) GetPostgresConnection(context.Context, models.ProfileSummary, string, string) (models.AzurePostgresConnection, error) {
	return models.AzurePostgresConnection{
		Host:    "localhost",
		Port:    54983,
		URI:     "postgresql://psqladmin:secret@localhost:54983/postgres?sslmode=disable",
		JDBCUrl: "jdbc:postgresql://localhost:54983/postgres?user=psqladmin&password=secret&sslmode=disable",
		Psql:    `psql "host=localhost port=54983 dbname=postgres user=psqladmin password=secret sslmode=disable"`,
		DotNet:  "Host=localhost;Port=54983;Database=postgres;Username=psqladmin;Password=secret;SSL Mode=Disable;",
	}, nil
}

func (stubAzureInventory) StartPostgresServer(_ context.Context, _ models.ProfileSummary, resourceGroup string, serverName string) (models.AzurePostgresLifecycleResult, error) {
	return models.AzurePostgresLifecycleResult{
		ServerName:    serverName,
		ResourceGroup: resourceGroup,
		Action:        "start",
		Summary:       "Started PostgreSQL flexible server " + serverName + ".",
	}, nil
}

func (stubAzureInventory) StopPostgresServer(_ context.Context, _ models.ProfileSummary, resourceGroup string, serverName string) (models.AzurePostgresLifecycleResult, error) {
	return models.AzurePostgresLifecycleResult{
		ServerName:    serverName,
		ResourceGroup: resourceGroup,
		Action:        "stop",
		Summary:       "Stopped PostgreSQL flexible server " + serverName + ".",
	}, nil
}

func (stubAzureInventory) ListStorageQueues(context.Context, models.ProfileSummary, string) ([]models.AzureStorageQueue, error) {
	return []models.AzureStorageQueue{{Name: "jobs"}}, nil
}

func (stubAzureInventory) GetQueueApproximateMessageCount(context.Context, models.ProfileSummary, string, string) (int64, error) {
	return 0, nil
}

func (stubAzureInventory) PeekQueueMessages(context.Context, models.ProfileSummary, string, string) ([]models.AzureQueueMessage, error) {
	return []models.AzureQueueMessage{{ID: "m1", Text: "hello", DequeueCount: 0}}, nil
}

func (stubAzureInventory) PurgeQueueMessages(_ context.Context, _ models.ProfileSummary, accountName string, queueName string) (models.AzureQueuePurgeResult, error) {
	return models.AzureQueuePurgeResult{
		AccountName: accountName,
		QueueName:   queueName,
		Summary:     "Purged all messages from queue " + queueName + " in " + accountName + ".",
	}, nil
}

func (stubAzureInventory) ListEntraUsers(context.Context, models.ProfileSummary) ([]models.AzureEntraUser, error) {
	return []models.AzureEntraUser{{DisplayName: "Ada", UserPrincipalName: "ada@contoso.com"}}, nil
}

func (stubAzureInventory) ListEntraGroups(context.Context, models.ProfileSummary) ([]models.AzureEntraGroup, error) {
	return []models.AzureEntraGroup{{DisplayName: "Engineers"}}, nil
}

func (stubAzureInventory) ListEntraAppRegistrations(context.Context, models.ProfileSummary) ([]models.AzureEntraApp, error) {
	return []models.AzureEntraApp{{DisplayName: "my-api", AppID: "app-1"}}, nil
}

func (stubAzureInventory) CheckCLIExtensions(context.Context) []models.AzureCLIExtensionStatus {
	return nil
}

func (stubAzureInventory) ListBastionHosts(context.Context, models.ProfileSummary) ([]models.AzureBastionHost, error) {
	return []models.AzureBastionHost{
		{Name: "bastion-hub", ResourceGroup: "rg-network", Location: "westeurope", SKU: "Standard"},
	}, nil
}

func (s stubDockerRuntime) Snapshot(context.Context) (models.DockerRuntimeSnapshot, error) {
	return s.snapshot, nil
}

func (s stubDockerRuntime) ListOwnedResources(context.Context) ([]models.ManagedDockerResource, error) {
	return append([]models.ManagedDockerResource(nil), s.resources...), nil
}

// blockingDockerRuntime simulates a Docker engine whose host is configured but
// unreachable, so calls block until their context is cancelled. This mirrors a
// stopped Docker Desktop where dialling the named pipe would otherwise wait
// forever.
type blockingDockerRuntime struct{}

func (blockingDockerRuntime) Snapshot(ctx context.Context) (models.DockerRuntimeSnapshot, error) {
	<-ctx.Done()
	return models.DockerRuntimeSnapshot{}, ctx.Err()
}

func (blockingDockerRuntime) ListOwnedResources(ctx context.Context) ([]models.ManagedDockerResource, error) {
	<-ctx.Done()
	return nil, ctx.Err()
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
	t.Setenv("DOCKER_HOST", "unix:///tmp/cloudsprocket-test-docker.sock")
	t.Setenv("DOCKER_CONTEXT", "desktop-linux")

	mustWriteFile(t, filepath.Join(home, ".aws", "config"), "[profile sandbox]\nregion = us-east-1\nsso_start_url = https://example.awsapps.com/start\nendpoint_url = http://192.168.50.168:4566\ncloudsprocket_allow_writes = true\n")
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
	dockerRuntime := stubDockerRuntime{
		snapshot: models.DockerRuntimeSnapshot{
			Reachable:     true,
			Host:          "unix:///tmp/cloudsprocket-test-docker.sock",
			HostSource:    "DOCKER_HOST",
			ContextName:   "desktop-linux",
			ServerVersion: "28.5.1",
			APIVersion:    "1.51",
			EngineName:    "docker",
			ResourceOwnership: models.DockerOwnershipPolicy{
				LabelKey:        "com.cloudsprocket.managed",
				LabelValue:      "true",
				ProjectLabelKey: "com.cloudsprocket.project",
				ProjectName:     "cloud-sprocket",
				Summary:         "Only CloudSprocket-managed Docker resources are eligible for future lifecycle control.",
			},
			Summary: "Docker engine is reachable and ready for managed runtime operations.",
			Details: []models.DetailField{{Label: "Host", Value: "unix:///tmp/cloudsprocket-test-docker.sock"}},
		},
		resources: []models.ManagedDockerResource{{
			ResourceID: "ctr-123",
			Kind:       "container",
			Name:       "cloudsprocket-localstack",
			State:      "running",
			Summary:    "CloudSprocket-managed emulator container.",
			Owned:      true,
		}},
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
		dockerRuntime,
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
	if len(workspace.S3Objects) != 0 {
		t.Fatalf("expected lightweight workspace.get to defer S3 object listings, got %+v", workspace.S3Objects)
	}
	if workspace.SelectedS3ObjectKey != "" {
		t.Fatalf("expected lightweight workspace.get to defer object selection, got %q", workspace.SelectedS3ObjectKey)
	}
	if len(workspace.S3ObjectMetadata) != 0 {
		t.Fatalf("expected lightweight workspace.get to defer object metadata, got %+v", workspace.S3ObjectMetadata)
	}
	if workspace.RuntimeSettings.DatabasePath == "" {
		t.Fatalf("expected workspace runtime settings to include a database path")
	}
	if workspace.RuntimeSettings.RuntimeMode != models.RuntimeModeCloud {
		t.Fatalf("expected default runtime mode to be cloud, got %s", workspace.RuntimeSettings.RuntimeMode)
	}
	if workspace.RuntimeSettings.LocalConfigDir == "" || workspace.RuntimeSettings.EmulatorStateDir == "" {
		t.Fatalf("expected local runtime directories in settings, got %+v", workspace.RuntimeSettings)
	}
	if workspace.RuntimeSettings.LocalStackImage != "localstack/localstack:stable" {
		t.Fatalf("expected default LocalStack image in settings, got %s", workspace.RuntimeSettings.LocalStackImage)
	}
	if workspace.DockerDiagnostics.EngineState != models.DockerEngineStateAvailable {
		t.Fatalf("expected docker diagnostics to use test endpoint, got %+v", workspace.DockerDiagnostics)
	}
	if workspace.DockerDiagnostics.Host != "unix:///tmp/cloudsprocket-test-docker.sock" {
		t.Fatalf("expected docker host to reflect DOCKER_HOST, got %+v", workspace.DockerDiagnostics)
	}
	if !workspace.DockerRuntime.Reachable || workspace.DockerRuntime.ServerVersion != "28.5.1" {
		t.Fatalf("expected live docker runtime snapshot, got %+v", workspace.DockerRuntime)
	}
	if len(workspace.DockerResources) != 1 || workspace.DockerResources[0].Name != "cloudsprocket-localstack" {
		t.Fatalf("expected docker resources from runtime, got %+v", workspace.DockerResources)
	}
	emulatorIDs := map[string]bool{}
	for _, summary := range workspace.EmulatorSummaries {
		emulatorIDs[summary.EmulatorID] = true
	}
	if len(workspace.EmulatorSummaries) != 2 || !emulatorIDs["localstack"] || !emulatorIDs["floci-az"] {
		t.Fatalf("expected localstack and floci-az emulator summaries, got %+v", workspace.EmulatorSummaries)
	}
	if len(workspace.LocalConfigArtifacts) != 3 {
		t.Fatalf("expected local config artifacts, got %+v", workspace.LocalConfigArtifacts)
	}
	if workspace.SelectedEC2Region != "us-east-1" || len(workspace.EC2Instances) != 0 {
		t.Fatalf("expected lightweight workspace.get to load EC2 regions only, got region=%q instances=%+v", workspace.SelectedEC2Region, workspace.EC2Instances)
	}

	runtimeResult, err := service.Handle(ctx, "runtime.get", nil, nil)
	if err != nil {
		t.Fatalf("expected runtime.get to succeed, got %v", err)
	}
	runtimeSnapshot := runtimeResult.(models.RuntimeSnapshot)
	if !runtimeSnapshot.DockerRuntime.Reachable || runtimeSnapshot.DockerRuntime.ServerVersion != "28.5.1" {
		t.Fatalf("expected runtime.get docker snapshot, got %+v", runtimeSnapshot.DockerRuntime)
	}
	if len(runtimeSnapshot.DockerResources) != 1 || len(runtimeSnapshot.EmulatorSummaries) != 2 {
		t.Fatalf("expected runtime.get resources and emulators, got resources=%+v emulators=%+v", runtimeSnapshot.DockerResources, runtimeSnapshot.EmulatorSummaries)
	}

	dockerRuntimeResult, err := service.Handle(ctx, "docker.runtime.get", nil, nil)
	if err != nil {
		t.Fatalf("expected docker.runtime.get to succeed, got %v", err)
	}
	if !dockerRuntimeResult.(models.DockerRuntimeSnapshot).Reachable {
		t.Fatalf("expected dedicated docker runtime snapshot to be reachable, got %+v", dockerRuntimeResult)
	}

	dockerResourcesResult, err := service.Handle(ctx, "docker.resources.list", nil, nil)
	if err != nil {
		t.Fatalf("expected docker.resources.list to succeed, got %v", err)
	}
	if len(dockerResourcesResult.([]models.ManagedDockerResource)) != 1 {
		t.Fatalf("expected dedicated docker resource list, got %+v", dockerResourcesResult)
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

	if _, err := service.Handle(ctx, "session.setWriteMode", []byte(`{"enabled":true}`), nil); err != nil {
		t.Fatalf("expected session.setWriteMode to succeed, got %v", err)
	}

	uploadPath := filepath.Join(tempDir, "demo.txt")
	mustWriteFile(t, uploadPath, "demo upload")
	uploadNotifier := recordingNotifier{events: make(chan models.JobStatus, 4)}
	uploadRequest := `{"sourcePath":` + strconv.Quote(uploadPath) + `,"objectKey":"reports/uploaded.txt"}`
	uploadResult, err := service.Handle(ctx, "aws.s3.uploadObject", []byte(uploadRequest), uploadNotifier)
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
	completedEC2Job := waitForJobStatus(t, ec2Notifier.events, "completed")
	if !strings.Contains(completedEC2Job.Message, "Desired state reached: running") {
		t.Fatalf("expected completed EC2 job to report desired state, got %+v", completedEC2Job)
	}
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
		stubLambdaInventory{},
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
	service.now = func() time.Time { return time.Date(2026, 4, 26, 10, 0, 0, 0, time.UTC) }

	ctx := context.Background()
	if _, err := service.Handle(ctx, "session.lock", nil, nil); err != nil {
		t.Fatalf("expected session.lock to succeed, got %v", err)
	}
	if _, err := service.Handle(ctx, "session.setWriteMode", []byte(`{"enabled":true}`), nil); err != nil {
		t.Fatalf("expected session.setWriteMode to succeed, got %v", err)
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

func TestServiceAllowsEC2ActionOnRealCloudWithWriteMode(t *testing.T) {
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
				{InstanceID: "i-0123456789abcdef0", Name: "prod-app", State: "running", InstanceType: "t3.small"},
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
		&stubS3Inventory{},
		ec2Inventory,
		stubLambdaInventory{},
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

	ctx := context.Background()
	if _, err := service.Handle(ctx, "session.lock", nil, nil); err != nil {
		t.Fatalf("expected session.lock to succeed, got %v", err)
	}
	if _, err := service.Handle(ctx, "session.setWriteMode", []byte(`{"enabled":true}`), nil); err != nil {
		t.Fatalf("expected session.setWriteMode to succeed on real cloud profile, got %v", err)
	}
	if _, err := service.Handle(ctx, "aws.ec2.selectInstance", []byte(`{"instanceId":"i-0123456789abcdef0"}`), nil); err != nil {
		t.Fatalf("expected aws.ec2.selectInstance to succeed, got %v", err)
	}
	notifier := recordingNotifier{events: make(chan models.JobStatus, 4)}
	result, err := service.Handle(ctx, "aws.ec2.invokeAction", []byte(`{"action":"reboot"}`), notifier)
	if err != nil {
		t.Fatalf("expected EC2 write action to queue on real cloud with write mode enabled, got %v", err)
	}
	if result.(models.JobStatus).Status != "queued" {
		t.Fatalf("expected queued EC2 job, got %+v", result)
	}
	completedJob := waitForJobStatus(t, notifier.events, "completed")
	if !strings.Contains(completedJob.Message, "Desired state reached: running") {
		t.Fatalf("expected completed EC2 job on real cloud, got %+v", completedJob)
	}
	if len(ec2Inventory.actionRequests) != 1 || ec2Inventory.actionRequests[0] != "reboot|us-east-1|i-0123456789abcdef0" {
		t.Fatalf("expected reboot request to hit EC2 inventory, got %+v", ec2Inventory.actionRequests)
	}
}

func TestServiceRejectsWriteActionsWithoutWriteMode(t *testing.T) {
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

	ec2Inventory := &stubEC2Inventory{
		regions: []string{"us-east-1"},
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
		&stubS3Inventory{},
		ec2Inventory,
		stubLambdaInventory{},
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

	ctx := context.Background()
	if _, err := service.Handle(ctx, "session.lock", nil, nil); err != nil {
		t.Fatalf("expected session.lock to succeed, got %v", err)
	}
	if _, err := service.Handle(ctx, "aws.ec2.selectInstance", []byte(`{"instanceId":"i-0123456789abcdef0"}`), nil); err != nil {
		t.Fatalf("expected aws.ec2.selectInstance to succeed, got %v", err)
	}
	if _, err := service.Handle(ctx, "aws.ec2.invokeAction", []byte(`{"action":"stop"}`), recordingNotifier{events: make(chan models.JobStatus, 1)}); err == nil {
		t.Fatalf("expected EC2 write action to be rejected without write mode enabled")
	}
	if len(ec2Inventory.actionRequests) != 0 {
		t.Fatalf("expected rejected action to avoid EC2 adapter calls, got %+v", ec2Inventory.actionRequests)
	}

	workspaceResult, err := service.Handle(ctx, "workspace.get", nil, nil)
	if err != nil {
		t.Fatalf("expected workspace.get to succeed, got %v", err)
	}
	workspace := workspaceResult.(models.WorkspaceSnapshot)
	if workspace.AWSWriteCapable != true || workspace.AWSWriteModeEnabled != false || workspace.AWSWritesEnabled != false {
		t.Fatalf("expected capable profile with write mode off, got capable=%v mode=%v writes=%v", workspace.AWSWriteCapable, workspace.AWSWriteModeEnabled, workspace.AWSWritesEnabled)
	}
}

func TestServiceAllowsEC2ActionOnLocalEndpointWithWriteMode(t *testing.T) {
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")

	mustWriteFile(t, filepath.Join(home, ".aws", "config"), "[profile sandbox]\nregion = us-east-1\nendpoint_url = http://192.168.50.168:4566\n")
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
				{InstanceID: "i-0123456789abcdef0", Name: "localstack-app", State: "running", InstanceType: "t3.small"},
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
		&stubS3Inventory{},
		ec2Inventory,
		stubLambdaInventory{},
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

	ctx := context.Background()
	if _, err := service.Handle(ctx, "session.lock", nil, nil); err != nil {
		t.Fatalf("expected session.lock to succeed, got %v", err)
	}
	if _, err := service.Handle(ctx, "session.setWriteMode", []byte(`{"enabled":true}`), nil); err != nil {
		t.Fatalf("expected session.setWriteMode to succeed on local endpoint profile, got %v", err)
	}
	if _, err := service.Handle(ctx, "aws.ec2.selectInstance", []byte(`{"instanceId":"i-0123456789abcdef0"}`), nil); err != nil {
		t.Fatalf("expected aws.ec2.selectInstance to succeed, got %v", err)
	}
	notifier := recordingNotifier{events: make(chan models.JobStatus, 4)}
	result, err := service.Handle(ctx, "aws.ec2.invokeAction", []byte(`{"action":"reboot"}`), notifier)
	if err != nil {
		t.Fatalf("expected EC2 write action to queue on local endpoint with write mode enabled, got %v", err)
	}
	if result.(models.JobStatus).Status != "queued" {
		t.Fatalf("expected queued EC2 job, got %+v", result)
	}
	completedJob := waitForJobStatus(t, notifier.events, "completed")
	if !strings.Contains(completedJob.Message, "Desired state reached: running") {
		t.Fatalf("expected completed EC2 job on local endpoint, got %+v", completedJob)
	}
	if len(ec2Inventory.actionRequests) != 1 || ec2Inventory.actionRequests[0] != "reboot|us-east-1|i-0123456789abcdef0" {
		t.Fatalf("expected reboot request to hit EC2 inventory, got %+v", ec2Inventory.actionRequests)
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
	firstService := New(settings, firstStore, discoveryService, s3Inventory, ec2Inventory, stubLambdaInventory{}, stubDynamoDBInventory{},
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
		&stubIAMInventory{}, stubAzureInventory{}, stubDockerRuntime{})
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
	secondService := New(settings, secondStore, discoveryService, s3Inventory, ec2Inventory, stubLambdaInventory{}, stubDynamoDBInventory{},
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
		&stubIAMInventory{}, stubAzureInventory{}, stubDockerRuntime{})

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
	if workspace.SelectedEC2Region != "eu-west-2" || len(workspace.EC2Instances) != 0 {
		t.Fatalf("expected lightweight workspace.get to restore EC2 region without instances, got region=%q instances=%+v", workspace.SelectedEC2Region, workspace.EC2Instances)
	}
}

func TestServiceResetClearsOnlyAppOwnedState(t *testing.T) {
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")
	configRoot := filepath.Join(tempDir, "cloudsprocket")
	settings := config.FromEnv(map[string]string{
		"CLOUDSPROCKET_CONFIG_DIR": configRoot,
	}, "linux", home)
	if err := settings.EnsureRuntimeDirs(); err != nil {
		t.Fatalf("expected runtime dirs to be created, got %v", err)
	}

	awsConfigPath := filepath.Join(home, ".aws", "config")
	mustWriteFile(t, awsConfigPath, "[profile sandbox]\nregion = us-east-1\n")
	mustWriteFile(t, filepath.Join(home, ".aws", "credentials"), "[sandbox]\naws_access_key_id = AKIAEXAMPLE\n")
	mustWriteFile(t, filepath.Join(settings.LocalConfigDir, "aws", "config"), "[profile cloudsprocket-localstack]\n")
	mustWriteFile(t, filepath.Join(settings.EmulatorStateDir, "localstack", "state", "payload.json"), "{}\n")

	dataStore, err := store.Open(settings.DatabasePath)
	if err != nil {
		t.Fatalf("expected sqlite store to open, got %v", err)
	}
	defer dataStore.Close()

	ctx := context.Background()
	if err := dataStore.SaveAppSetting(ctx, "theme", map[string]string{"mode": "dark"}); err != nil {
		t.Fatalf("expected app setting save to succeed, got %v", err)
	}
	if _, err := dataStore.AppendLog(ctx, "info", "Before reset.", "", "2026-04-14T09:00:00Z"); err != nil {
		t.Fatalf("expected log append to succeed, got %v", err)
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
		&stubEC2Inventory{},
		stubLambdaInventory{},
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

	if _, err := service.Handle(ctx, "session.lock", nil, nil); err != nil {
		t.Fatalf("expected session.lock before reset to succeed, got %v", err)
	}
	if _, err := service.Handle(ctx, "preferences.update", []byte(`{
		"disabledProviders":["gcp"],
		"disabledServices":{"aws":["s3","ecs"]}
	}`), nil); err != nil {
		t.Fatalf("expected preferences.update before reset to succeed, got %v", err)
	}

	result, err := service.Handle(ctx, "app.reset", []byte(`{"confirmation":"RESET"}`), nil)
	if err != nil {
		t.Fatalf("expected app.reset to succeed, got %v", err)
	}
	reset := result.(models.AppResetResult)
	if len(reset.ResetPaths) != 2 {
		t.Fatalf("expected app-owned local folders to be reset, got %+v", reset)
	}
	if _, err := os.Stat(awsConfigPath); err != nil {
		t.Fatalf("expected real AWS config to remain, got %v", err)
	}
	waitForPathRemoved(t, filepath.Join(settings.LocalConfigDir, "aws", "config"))
	waitForPathRemoved(t, filepath.Join(settings.EmulatorStateDir, "localstack", "state", "payload.json"))
	var theme map[string]string
	if ok, err := dataStore.LoadAppSetting(ctx, "theme", &theme); err != nil || ok {
		t.Fatalf("expected app setting to be reset, ok=%v err=%v", ok, err)
	}
	if logs, err := dataStore.ListLogs(ctx, 10); err != nil || len(logs) != 0 {
		t.Fatalf("expected activity logs to be reset, logs=%+v err=%v", logs, err)
	}
	session, _, err := dataStore.LoadSession(ctx)
	if err != nil {
		t.Fatalf("expected session load after reset to succeed, got %v", err)
	}
	if session.IsLocked || session.LockedProfileID != "" || len(session.WorkspaceTabs) != 0 {
		t.Fatalf("expected reset session to return to setup state, got %+v", session)
	}
	preferencesResult, err := service.Handle(ctx, "preferences.get", nil, nil)
	if err != nil {
		t.Fatalf("expected preferences.get after reset to succeed, got %v", err)
	}
	preferences := preferencesResult.(models.PreferencesSnapshot)
	if len(preferences.Preferences.DisabledProviders) != 0 {
		t.Fatalf("expected service preferences to reset, got providers=%#v", preferences.Preferences.DisabledProviders)
	}
	if len(preferences.Preferences.DisabledServices) != 0 {
		t.Fatalf("expected service preferences to reset, got services=%#v", preferences.Preferences.DisabledServices)
	}
	if _, err := os.Stat(filepath.Join(settings.ConfigDir, preferencesFileName)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected preferences file to be removed on reset, got err=%v", err)
	}
}

func TestResetManagedDirectorySkipsExternalCloudConfigPath(t *testing.T) {
	tempDir := t.TempDir()
	configRoot := filepath.Join(tempDir, "cloudsprocket")
	externalConfig := filepath.Join(tempDir, "home", ".aws", "config")
	mustWriteFile(t, externalConfig, "[profile sandbox]\n")

	removed, skipped, err := resetManagedDirectory(configRoot, externalConfig, "local-config")
	if err != nil {
		t.Fatalf("expected external path skip to succeed, got %v", err)
	}
	if removed != "" || skipped == "" {
		t.Fatalf("expected external path to be skipped, removed=%q skipped=%q", removed, skipped)
	}
	if _, err := os.Stat(externalConfig); err != nil {
		t.Fatalf("expected external cloud config to remain, got %v", err)
	}
}

func waitForJobStatus(t *testing.T, events <-chan models.JobStatus, status string) models.JobStatus {
	t.Helper()
	// Windows CI can be slower under load; 2s has timed out flakily on
	// TestAWSLifecycleJobUpdatedResultRemainsFullWorkspaceSnapshot.
	timeout := time.After(8 * time.Second)
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

func waitForPathRemoved(t *testing.T, path string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for {
		if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s to be removed", path)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestPrepareProfileWritesDiscoverableLocalProfiles(t *testing.T) {
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")

	// An existing AWS profile and a BOM-prefixed Azure profile with one real
	// subscription must both be preserved when the local profiles are written.
	mustWriteFile(t, filepath.Join(home, ".aws", "config"), "[profile existing]\nregion = eu-west-2\n")
	mustWriteFile(t, filepath.Join(home, ".azure", "azureProfile.json"), "\ufeff{\n  \"subscriptions\": [\n    {\"id\": \"real-sub\", \"name\": \"Real Sub\", \"tenantId\": \"t1\"}\n  ]\n}\n")

	settings := config.FromEnv(map[string]string{}, "linux", home)
	if err := settings.EnsureRuntimeDirs(); err != nil {
		t.Fatalf("expected runtime dirs to be created, got %v", err)
	}
	dataStore, err := store.Open(settings.DatabasePath)
	if err != nil {
		t.Fatalf("expected sqlite store to open, got %v", err)
	}
	defer dataStore.Close()

	service := New(
		settings,
		dataStore,
		discovery.New(settings, func(string) (string, error) { return "", nil }),
		&stubS3Inventory{},
		&stubEC2Inventory{},
		stubLambdaInventory{},
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

	ctx := context.Background()
	if _, err := service.Handle(ctx, "emulators.prepareProfile", []byte(`{"emulatorId":"localstack"}`), nil); err != nil {
		t.Fatalf("expected localstack prepareProfile to succeed, got %v", err)
	}
	if _, err := service.Handle(ctx, "emulators.prepareProfile", []byte(`{"emulatorId":"floci-az"}`), nil); err != nil {
		t.Fatalf("expected floci-az prepareProfile to succeed, got %v", err)
	}

	awsConfig := mustReadFile(t, settings.AWSConfigPath)
	if !strings.Contains(awsConfig, "[profile existing]") {
		t.Fatalf("expected existing AWS profile to be preserved, got:\n%s", awsConfig)
	}
	if !strings.Contains(awsConfig, "[profile cloudsprocket-localstack]") || !strings.Contains(awsConfig, "endpoint_url = http://localhost:4566") {
		t.Fatalf("expected local AWS profile with endpoint, got:\n%s", awsConfig)
	}
	awsCreds := mustReadFile(t, settings.AWSCredentialsPath)
	if !strings.Contains(awsCreds, "[cloudsprocket-localstack]") || !strings.Contains(awsCreds, "aws_access_key_id = test") {
		t.Fatalf("expected local AWS credentials, got:\n%s", awsCreds)
	}

	azureProfile := mustReadFile(t, settings.AzureProfilePath())
	if !strings.Contains(azureProfile, "real-sub") {
		t.Fatalf("expected existing Azure subscription to be preserved, got:\n%s", azureProfile)
	}
	if !strings.Contains(azureProfile, "cloudsprocket-floci-az") {
		t.Fatalf("expected local Azure subscription to be added, got:\n%s", azureProfile)
	}

	// Discovery must now surface both local profiles so they can be locked.
	snapshot, err := service.discovery.Discover()
	if err != nil {
		t.Fatalf("expected discovery to succeed, got %v", err)
	}
	foundAWS := false
	foundAzure := false
	for _, profile := range snapshot.Profiles {
		if profile.ProviderID == "aws" && profile.ProfileID == "cloudsprocket-localstack" {
			foundAWS = true
		}
		if profile.ProviderID == "azure" && profile.ProfileID == "cloudsprocket-floci-az" {
			foundAzure = true
		}
	}
	if !foundAWS || !foundAzure {
		t.Fatalf("expected discovery to surface both local profiles, aws=%v azure=%v", foundAWS, foundAzure)
	}
}

func mustReadFile(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read %s: %v", path, err)
	}
	return string(data)
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

// TestDockerRuntimeProbeIsBoundedWhenEngineBlocks is a regression test for the
// freeze where an unreachable Docker engine hung every request. The probe must
// return within its own timeout instead of blocking on the Docker dial forever.
func TestDockerRuntimeProbeIsBoundedWhenEngineBlocks(t *testing.T) {
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

	service := New(
		settings,
		dataStore,
		discovery.New(settings, func(string) (string, error) { return "", nil }),
		&stubS3Inventory{},
		&stubEC2Inventory{},
		stubLambdaInventory{},
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
		blockingDockerRuntime{},
	)

	done := make(chan models.DockerRuntimeSnapshot, 1)
	go func() {
		result, handleErr := service.Handle(context.Background(), "docker.runtime.get", nil, nil)
		if handleErr != nil {
			t.Errorf("expected docker.runtime.get to succeed, got %v", handleErr)
			done <- models.DockerRuntimeSnapshot{}
			return
		}
		done <- result.(models.DockerRuntimeSnapshot)
	}()

	select {
	case snapshot := <-done:
		if snapshot.Reachable {
			t.Fatalf("expected an unreachable docker snapshot when the engine blocks, got %+v", snapshot)
		}
	case <-time.After(appruntime.DockerProbeTimeout + 5*time.Second):
		t.Fatalf("docker.runtime.get hung past the probe timeout; the Docker call is not bounded")
	}
}

// TestDockerAndEmulatorProbesRespectParentContextCancel is a regression for
// architecture F-020: probes used context.Background(), so a cancelled RPC
// still waited out DockerProbeTimeout on Docker dials. Parent cancel must
// abort the probe well under the full timeout.
func TestDockerAndEmulatorProbesRespectParentContextCancel(t *testing.T) {
	rt := appruntime.New(appruntime.Deps{
		Docker:     blockingDockerRuntime{},
		LocalStack: blockingLocalStackManager{},
	})

	// Docker Snapshot: cancel parent after a short delay; probe must exit early.
	ctx, cancel := context.WithCancel(context.Background())
	dockerDone := make(chan time.Duration, 1)
	go func() {
		start := time.Now()
		_ = rt.ProbeDockerRuntimeSnapshot(ctx)
		dockerDone <- time.Since(start)
	}()
	time.Sleep(40 * time.Millisecond)
	cancel()
	select {
	case elapsed := <-dockerDone:
		if elapsed > time.Second {
			t.Fatalf("Docker Snapshot took %v after parent cancel; expected early exit under 1s", elapsed)
		}
	case <-time.After(appruntime.DockerProbeTimeout + time.Second):
		t.Fatal("Docker Snapshot ignored parent context cancel")
	}

	// Emulator Status: same parent-cancel contract for live emulator listing.
	ctx, cancel = context.WithCancel(context.Background())
	emulatorDone := make(chan time.Duration, 1)
	go func() {
		start := time.Now()
		_, _ = rt.HandleEmulatorsList(ctx)
		emulatorDone <- time.Since(start)
	}()
	time.Sleep(40 * time.Millisecond)
	cancel()
	select {
	case elapsed := <-emulatorDone:
		if elapsed > time.Second {
			t.Fatalf("emulators list took %v after parent cancel; expected early exit under 1s", elapsed)
		}
	case <-time.After(appruntime.DockerProbeTimeout + time.Second):
		t.Fatal("emulators list ignored parent context cancel")
	}
}

// blockingLocalStackManager blocks Status until the context is cancelled so
// parent-cancel regression tests do not need a real Docker engine.
type blockingLocalStackManager struct{}

func (blockingLocalStackManager) Status(ctx context.Context) (models.EmulatorStatusDetail, error) {
	<-ctx.Done()
	return models.EmulatorStatusDetail{}, ctx.Err()
}

func (blockingLocalStackManager) Start(context.Context, models.EmulatorStartOptions) (models.EmulatorStatusDetail, error) {
	return models.EmulatorStatusDetail{}, errors.New("not implemented")
}

func (blockingLocalStackManager) Stop(context.Context) (models.EmulatorStatusDetail, error) {
	return models.EmulatorStatusDetail{}, errors.New("not implemented")
}

func (blockingLocalStackManager) Logs(context.Context, int) (models.EmulatorLogSnapshot, error) {
	return models.EmulatorLogSnapshot{}, errors.New("not implemented")
}

func (blockingLocalStackManager) EnsureManagedProfile() error {
	return nil
}

// TestUnlockNotBlockedBySlowWorkspaceFetch is a regression test for the unlock
// freeze: the Local Runtime tab polls workspace.get, which builds the snapshot
// with slow Docker probes. If that snapshot build holds the service mutex,
// session.unlock is starved and the user cannot leave the locked workspace.
func TestUnlockNotBlockedBySlowWorkspaceFetch(t *testing.T) {
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
		&stubEC2Inventory{},
		stubLambdaInventory{},
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
		blockingDockerRuntime{},
	)

	if _, err := service.Handle(context.Background(), "session.lock", nil, nil); err != nil {
		t.Fatalf("expected session.lock to succeed, got %v", err)
	}

	// workspace.get is slow because the Docker probe blocks for the full timeout.
	wsDone := make(chan struct{})
	go func() {
		_, _ = service.Handle(context.Background(), "workspace.get", nil, nil)
		close(wsDone)
	}()

	// Let the workspace fetch get past the brief locked section and into its
	// lock-free Docker probe.
	time.Sleep(250 * time.Millisecond)

	unlockDone := make(chan error, 1)
	start := time.Now()
	go func() {
		_, err := service.Handle(context.Background(), "session.unlock", nil, nil)
		unlockDone <- err
	}()

	select {
	case err := <-unlockDone:
		if err != nil {
			t.Fatalf("expected session.unlock to succeed, got %v", err)
		}
		// Unlock must finish well under a full Docker probe (3s). Half-probe
		// (1.5s) flakes on loaded Windows CI runners; two-thirds still proves
		// unlock is not serialised behind the slow workspace fetch.
		if elapsed := time.Since(start); elapsed > (appruntime.DockerProbeTimeout*2)/3 {
			t.Fatalf("session.unlock took %v; it is blocked behind the slow workspace fetch", elapsed)
		}
	case <-time.After(appruntime.DockerProbeTimeout + 2*time.Second):
		t.Fatalf("session.unlock is starved while workspace.get holds the lock during Docker probing")
	}

	<-wsDone
}
