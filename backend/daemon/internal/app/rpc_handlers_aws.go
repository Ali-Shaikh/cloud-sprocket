// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
)

// registerAWSHandlers registers all aws.* JSON-RPC methods.
func (s *Service) registerAWSHandlers(m *handlerRegistry) {
	m.register("aws.s3.selectBucket", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsS3SelectBucket(ctx, params, notifier)
	})
	m.register("aws.s3.selectObject", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsS3SelectObject(ctx, params, notifier)
	})
	m.register("aws.s3.setPrefixFilter", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsS3SetPrefixFilter(ctx, params, notifier)
	})
	m.register("aws.s3.loadMoreObjects", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsS3LoadMoreObjects(ctx, params, notifier)
	})
	m.register("aws.s3.uploadObject", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsS3UploadObject(ctx, params, notifier)
	})
	m.register("aws.s3.deleteObject", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsS3DeleteObject(ctx, params, notifier)
	})
	m.register("aws.s3.createBucket", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsS3CreateBucket(ctx, params, notifier)
	})
	m.register("aws.s3.copyObject", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsS3CopyObject(ctx, params, notifier)
	})
	m.register("aws.s3.createFolderPrefix", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsS3CreateFolderPrefix(ctx, params, notifier)
	})
	m.register("aws.s3.presignObject", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsS3PresignObject(ctx, params, notifier)
	})
	m.register("aws.s3.analyseUrl", func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) {
		return s.handleAwsS3AnalyseUrl(params)
	})
	m.register("aws.s3.validateUrl", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsS3ValidateUrl(ctx, params, notifier)
	})
	m.register("aws.ec2.selectRegion", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsEc2SelectRegion(ctx, params, notifier)
	})
	m.register("aws.ec2.selectInstance", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsEc2SelectInstance(ctx, params, notifier)
	})
	m.register("aws.ec2.invokeAction", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsEc2InvokeAction(ctx, params, notifier)
	})
	m.register("aws.ec2.runInstances", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsEc2RunInstances(ctx, params, notifier)
	})
	m.register("aws.ec2.terminateInstances", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsEc2TerminateInstances(ctx, params, notifier)
	})
	m.register("aws.lambda.selectRegion", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsLambdaSelectRegion(ctx, params, notifier)
	})
	m.register("aws.lambda.selectFunction", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsLambdaSelectFunction(ctx, params, notifier)
	})
	m.register("aws.dynamodb.selectRegion", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsDynamodbSelectRegion(ctx, params, notifier)
	})
	m.register("aws.dynamodb.selectTable", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsDynamodbSelectTable(ctx, params, notifier)
	})
	m.register("aws.dynamodb.putItem", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsDynamodbPutItem(ctx, params, notifier)
	})
	m.register("aws.dynamodb.deleteItem", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsDynamodbDeleteItem(ctx, params, notifier)
	})
	m.register("aws.sqs.selectRegion", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsSqsSelectRegion(ctx, params, notifier)
	})
	m.register("aws.sqs.selectQueue", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsSqsSelectQueue(ctx, params, notifier)
	})
	m.register("aws.sqs.peek", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsSqsPeek(ctx, params, notifier)
	})
	m.register("aws.sqs.sendMessage", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsSqsSendMessage(ctx, params, notifier)
	})
	m.register("aws.sqs.createQueue", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsSqsCreateQueue(ctx, params, notifier)
	})
	m.register("aws.sns.selectRegion", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsSnsSelectRegion(ctx, params, notifier)
	})
	m.register("aws.sns.selectTopic", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsSnsSelectTopic(ctx, params, notifier)
	})
	m.register("aws.sns.publish", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsSnsPublish(ctx, params, notifier)
	})
	m.register("aws.sns.createTopic", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsSnsCreateTopic(ctx, params, notifier)
	})
	m.register("aws.rds.selectRegion", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsRdsSelectRegion(ctx, params, notifier)
	})
	m.register("aws.rds.selectInstance", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsRdsSelectInstance(ctx, params, notifier)
	})
	m.register("aws.ecs.selectRegion", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsEcsSelectRegion(ctx, params, notifier)
	})
	m.register("aws.ecs.selectCluster", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsEcsSelectCluster(ctx, params, notifier)
	})
	m.register("aws.ecs.selectService", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsEcsSelectService(ctx, params, notifier)
	})
	m.register("aws.ecs.selectTask", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsEcsSelectTask(ctx, params, notifier)
	})
	m.register("aws.eks.selectRegion", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsEksSelectRegion(ctx, params, notifier)
	})
	m.register("aws.eks.selectCluster", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsEksSelectCluster(ctx, params, notifier)
	})
	m.register("aws.cloudformation.selectRegion", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsCloudFormationSelectRegion(ctx, params, notifier)
	})
	m.register("aws.cloudformation.selectStack", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsCloudFormationSelectStack(ctx, params, notifier)
	})
	m.register("aws.eventbridge.selectRegion", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsEventBridgeSelectRegion(ctx, params, notifier)
	})
	m.register("aws.eventbridge.selectBus", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsEventBridgeSelectBus(ctx, params, notifier)
	})
	m.register("aws.route53.selectHostedZone", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsRoute53SelectHostedZone(ctx, params, notifier)
	})
	m.register("aws.elb.selectRegion", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsElbv2SelectRegion(ctx, params, notifier)
	})
	m.register("aws.elb.selectLoadBalancer", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsElbv2SelectLoadBalancer(ctx, params, notifier)
	})
	m.register("aws.kms.selectRegion", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsKmsSelectRegion(ctx, params, notifier)
	})
	m.register("aws.kms.selectKey", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsKmsSelectKey(ctx, params, notifier)
	})
	m.register("aws.apigateway.selectRegion", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsApiGatewaySelectRegion(ctx, params, notifier)
	})
	m.register("aws.apigateway.selectApi", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsApiGatewaySelectApi(ctx, params, notifier)
	})
	m.register("aws.secrets.selectRegion", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsSecretsManagerSelectRegion(ctx, params, notifier)
	})
	m.register("aws.secrets.selectSecret", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsSecretsManagerSelectSecret(ctx, params, notifier)
	})
	m.register("aws.secrets.reveal", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsSecretsManagerReveal(ctx, params, notifier)
	})
	m.register("aws.logs.selectRegion", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsLogsSelectRegion(ctx, params, notifier)
	})
	m.register("aws.logs.selectLogGroup", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsLogsSelectLogGroup(ctx, params, notifier)
	})
	m.register("aws.iam.selectRole", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsIamSelectRole(ctx, params, notifier)
	})
	m.register("aws.lambda.describe", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsLambdaDescribe(ctx, params, notifier)
	})
	m.register("aws.lambda.invoke", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsLambdaInvoke(ctx, params, notifier)
	})
	m.register("aws.lambda.create", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsLambdaCreate(ctx, params, notifier)
	})
	m.register("aws.lambda.deleteFunction", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsLambdaDeleteFunction(ctx, params, notifier)
	})
	m.register("aws.rds.startInstance", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsRdsStartInstance(ctx, params, notifier)
	})
	m.register("aws.rds.stopInstance", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsRdsStopInstance(ctx, params, notifier)
	})
	m.register("aws.logs.createLogGroup", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsLogsCreateLogGroup(ctx, params, notifier)
	})
	m.register("aws.logs.filterEvents", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsLogsFilterEvents(ctx, params, notifier)
	})
	m.register("aws.logs.putLogEvents", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsLogsPutLogEvents(ctx, params, notifier)
	})
	m.register("aws.iam.createRole", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsIamCreateRole(ctx, params, notifier)
	})
	m.register("aws.inventory.get", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAwsInventoryGet(ctx, params, notifier)
	})
}
