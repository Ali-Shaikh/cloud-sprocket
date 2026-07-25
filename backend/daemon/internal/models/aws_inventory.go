// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package models

// AwsInventorySlice is the scoped response returned by aws.inventory.get.
// Exactly one embedded payload in Payload is populated, as selected by Scope.
type AwsInventorySlice struct {
	ProviderID string              `json:"providerId"`
	Scope      string              `json:"scope"`
	Payload    AwsInventoryPayload `json:"payload"`
}

// AwsInventoryPayload is a closed set of flat AWS inventory payloads. Anonymous
// pointers preserve the existing WorkspaceSnapshot field names on the wire
// while ensuring unrelated scopes are omitted.
type AwsInventoryPayload struct {
	*AwsS3InventoryPayload
	*AwsEc2InventoryPayload
	*AwsLambdaInventoryPayload
	*AwsDynamoDBInventoryPayload
	*AwsSqsInventoryPayload
	*AwsSnsInventoryPayload
	*AwsRdsInventoryPayload
	*AwsEcsInventoryPayload
	*AwsEksInventoryPayload
	*AwsCloudFormationInventoryPayload
	*AwsEventBridgeInventoryPayload
	*AwsRoute53InventoryPayload
	*AwsElbInventoryPayload
	*AwsKmsInventoryPayload
	*AwsApiGatewayInventoryPayload
	*AwsSecretsManagerInventoryPayload
	*AwsLogsInventoryPayload
	*AwsIamInventoryPayload
}

type AwsS3InventoryPayload struct {
	SelectedS3BucketName string               `json:"selectedS3BucketName,omitempty"`
	SelectedS3ObjectKey  string               `json:"selectedS3ObjectKey,omitempty"`
	S3PrefixFilter       string               `json:"s3PrefixFilter,omitempty"`
	S3StatusMessage      string               `json:"s3StatusMessage,omitempty"`
	S3Buckets            []AwsS3Bucket        `json:"s3Buckets"`
	S3Objects            []AwsS3Object        `json:"s3Objects"`
	S3ObjectsNextToken   string               `json:"s3ObjectsNextToken,omitempty"`
	S3ObjectsHasMore     bool                 `json:"s3ObjectsHasMore,omitempty"`
	S3ObjectMetadata     []DetailField        `json:"s3ObjectMetadata"`
	S3ExportSnippets     []AwsS3ExportSnippet `json:"s3ExportSnippets"`
}

type AwsEc2InventoryPayload struct {
	SelectedEC2Region     string           `json:"selectedEc2Region,omitempty"`
	SelectedEC2InstanceID string           `json:"selectedEc2InstanceId,omitempty"`
	EC2StatusMessage      string           `json:"ec2StatusMessage,omitempty"`
	EC2Regions            []string         `json:"ec2Regions"`
	EC2Instances          []AwsEc2Instance `json:"ec2Instances"`
}

type AwsLambdaInventoryPayload struct {
	SelectedLambdaRegion       string              `json:"selectedLambdaRegion,omitempty"`
	SelectedLambdaFunctionName string              `json:"selectedLambdaFunctionName,omitempty"`
	LambdaStatusMessage        string              `json:"lambdaStatusMessage,omitempty"`
	LambdaRegions              []string            `json:"lambdaRegions"`
	LambdaFunctions            []AwsLambdaFunction `json:"lambdaFunctions"`
}

type AwsDynamoDBInventoryPayload struct {
	SelectedDynamoDBRegion    string             `json:"selectedDynamodbRegion,omitempty"`
	SelectedDynamoDBTableName string             `json:"selectedDynamodbTableName,omitempty"`
	DynamoDBStatusMessage     string             `json:"dynamodbStatusMessage,omitempty"`
	DynamoDBRegions           []string           `json:"dynamodbRegions"`
	DynamoDBTables            []AwsDynamoDBTable `json:"dynamodbTables"`
}

type AwsSqsInventoryPayload struct {
	SelectedSQSRegion   string        `json:"selectedSqsRegion,omitempty"`
	SelectedSQSQueueURL string        `json:"selectedSqsQueueUrl,omitempty"`
	SQSStatusMessage    string        `json:"sqsStatusMessage,omitempty"`
	SQSRegions          []string      `json:"sqsRegions"`
	SQSQueues           []AwsSqsQueue `json:"sqsQueues"`
}

type AwsSnsInventoryPayload struct {
	SelectedSNSRegion   string        `json:"selectedSnsRegion,omitempty"`
	SelectedSNSTopicArn string        `json:"selectedSnsTopicArn,omitempty"`
	SNSStatusMessage    string        `json:"snsStatusMessage,omitempty"`
	SNSRegions          []string      `json:"snsRegions"`
	SNSTopics           []AwsSnsTopic `json:"snsTopics"`
}

type AwsRdsInventoryPayload struct {
	SelectedRDSRegion     string           `json:"selectedRdsRegion,omitempty"`
	SelectedRDSInstanceID string           `json:"selectedRdsInstanceId,omitempty"`
	RDSStatusMessage      string           `json:"rdsStatusMessage,omitempty"`
	RDSRegions            []string         `json:"rdsRegions"`
	RDSInstances          []AwsRdsInstance `json:"rdsInstances"`
}

type AwsEcsInventoryPayload struct {
	SelectedECSRegion     string          `json:"selectedEcsRegion,omitempty"`
	SelectedECSClusterArn string          `json:"selectedEcsClusterArn,omitempty"`
	SelectedECSServiceArn string          `json:"selectedEcsServiceArn,omitempty"`
	SelectedECSTaskArn    string          `json:"selectedEcsTaskArn,omitempty"`
	ECSStatusMessage      string          `json:"ecsStatusMessage,omitempty"`
	ECSRegions            []string        `json:"ecsRegions"`
	ECSClusters           []AwsEcsCluster `json:"ecsClusters"`
	ECSServices           []AwsEcsService `json:"ecsServices"`
	ECSTasks              []AwsEcsTask    `json:"ecsTasks"`
}

type AwsEksInventoryPayload struct {
	SelectedEKSRegion      string            `json:"selectedEksRegion,omitempty"`
	SelectedEKSClusterName string            `json:"selectedEksClusterName,omitempty"`
	EKSStatusMessage       string            `json:"eksStatusMessage,omitempty"`
	EKSRegions             []string          `json:"eksRegions"`
	EKSClusters            []AwsEksCluster   `json:"eksClusters"`
	EKSNodeGroups          []AwsEksNodeGroup `json:"eksNodeGroups"`
}

type AwsCloudFormationInventoryPayload struct {
	SelectedCloudFormationRegion    string                        `json:"selectedCloudFormationRegion,omitempty"`
	SelectedCloudFormationStackName string                        `json:"selectedCloudFormationStackName,omitempty"`
	CloudFormationStatusMessage     string                        `json:"cloudFormationStatusMessage,omitempty"`
	CloudFormationRegions           []string                      `json:"cloudFormationRegions"`
	CloudFormationStacks            []AwsCloudFormationStack      `json:"cloudFormationStacks"`
	CloudFormationStackEvents       []AwsCloudFormationStackEvent `json:"cloudFormationStackEvents"`
}

type AwsEventBridgeInventoryPayload struct {
	SelectedEventBridgeRegion  string               `json:"selectedEventBridgeRegion,omitempty"`
	SelectedEventBridgeBusName string               `json:"selectedEventBridgeBusName,omitempty"`
	EventBridgeStatusMessage   string               `json:"eventBridgeStatusMessage,omitempty"`
	EventBridgeRegions         []string             `json:"eventBridgeRegions"`
	EventBridgeBuses           []AwsEventBridgeBus  `json:"eventBridgeBuses"`
	EventBridgeRules           []AwsEventBridgeRule `json:"eventBridgeRules"`
}

type AwsRoute53InventoryPayload struct {
	SelectedRoute53HostedZoneID string                        `json:"selectedRoute53HostedZoneId,omitempty"`
	Route53StatusMessage        string                        `json:"route53StatusMessage,omitempty"`
	Route53HostedZones          []AwsRoute53HostedZone        `json:"route53HostedZones"`
	Route53ResourceRecordSets   []AwsRoute53ResourceRecordSet `json:"route53ResourceRecordSets"`
}

type AwsElbInventoryPayload struct {
	SelectedElbRegion          string               `json:"selectedElbRegion,omitempty"`
	SelectedElbLoadBalancerArn string               `json:"selectedElbLoadBalancerArn,omitempty"`
	ElbStatusMessage           string               `json:"elbStatusMessage,omitempty"`
	ElbRegions                 []string             `json:"elbRegions"`
	ElbLoadBalancers           []AwsElbLoadBalancer `json:"elbLoadBalancers"`
	ElbTargetGroups            []AwsElbTargetGroup  `json:"elbTargetGroups"`
}

type AwsKmsInventoryPayload struct {
	SelectedKmsRegion string        `json:"selectedKmsRegion,omitempty"`
	SelectedKmsKeyId  string        `json:"selectedKmsKeyId,omitempty"`
	KmsStatusMessage  string        `json:"kmsStatusMessage,omitempty"`
	KmsRegions        []string      `json:"kmsRegions"`
	KmsKeys           []AwsKmsKey   `json:"kmsKeys"`
	KmsAliases        []AwsKmsAlias `json:"kmsAliases"`
}

type AwsApiGatewayInventoryPayload struct {
	SelectedApiGatewayRegion string               `json:"selectedApiGatewayRegion,omitempty"`
	SelectedApiGatewayApiKey string               `json:"selectedApiGatewayApiKey,omitempty"`
	ApiGatewayStatusMessage  string               `json:"apiGatewayStatusMessage,omitempty"`
	ApiGatewayRegions        []string             `json:"apiGatewayRegions"`
	ApiGatewayApis           []AwsApiGatewayApi   `json:"apiGatewayApis"`
	ApiGatewayStages         []AwsApiGatewayStage `json:"apiGatewayStages"`
}

type AwsSecretsManagerInventoryPayload struct {
	SelectedSecretsManagerRegion string                    `json:"selectedSecretsManagerRegion,omitempty"`
	SelectedSecretsManagerName   string                    `json:"selectedSecretsManagerName,omitempty"`
	SecretsManagerStatusMessage  string                    `json:"secretsManagerStatusMessage,omitempty"`
	SecretsManagerRegions        []string                  `json:"secretsManagerRegions"`
	SecretsManagerSecrets        []AwsSecretsManagerSecret `json:"secretsManagerSecrets"`
}

type AwsLogsInventoryPayload struct {
	SelectedLogsRegion   string        `json:"selectedLogsRegion,omitempty"`
	SelectedLogGroupName string        `json:"selectedLogGroupName,omitempty"`
	LogsStatusMessage    string        `json:"logsStatusMessage,omitempty"`
	LogsRegions          []string      `json:"logsRegions"`
	LogGroups            []AwsLogGroup `json:"logGroups"`
}

type AwsIamInventoryPayload struct {
	SelectedIAMRoleName string         `json:"selectedIamRoleName,omitempty"`
	IAMStatusMessage    string         `json:"iamStatusMessage,omitempty"`
	IAMRoles            []AwsIamRole   `json:"iamRoles"`
	IAMPolicies         []AwsIamPolicy `json:"iamPolicies"`
}
