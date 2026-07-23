// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"sort"
)

// RPCHandler is the uniform signature for JSON-RPC method handlers.
// Registration replaces the former 171-case switch in Service.Handle.
type RPCHandler func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error)

// buildMethodHandlers returns the method name -> handler map.
// Built once per Service via sync.Once (see methodHandlers).
func (s *Service) buildMethodHandlers() map[string]RPCHandler {
	// Pre-size for the known surface so the map does not rehash during register.
	m := make(map[string]RPCHandler, 171)
	s.registerMethodHandlers(m)
	return m
}

func (s *Service) methodHandlers() map[string]RPCHandler {
	s.handlersOnce.Do(func() {
		s.handlers = s.buildMethodHandlers()
	})
	return s.handlers
}

// registerMethodHandlers maps every RPC method name to its Service handler.
// New methods must be registered here (or in a domain helper called from here).
func (s *Service) registerMethodHandlers(m map[string]RPCHandler) {
	m["providers.list"] = func(_ context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.handleProvidersList() }
	m["profiles.list"] = func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleProfilesList(params) }
	m["session.get"] = func(ctx context.Context, _ json.RawMessage, notifier Notifier) (any, error) { return s.handleSessionGet(ctx, notifier) }
	m["workspace.get"] = func(ctx context.Context, _ json.RawMessage, notifier Notifier) (any, error) { return s.handleWorkspaceGet(ctx, notifier) }
	m["runtime.get"] = func(_ context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.handleRuntimeGet() }
	m["aws.s3.selectBucket"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsS3SelectBucket(ctx, params, notifier) }
	m["aws.s3.selectObject"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsS3SelectObject(ctx, params, notifier) }
	m["aws.s3.setPrefixFilter"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsS3SetPrefixFilter(ctx, params, notifier) }
	m["aws.s3.loadMoreObjects"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsS3LoadMoreObjects(ctx, params, notifier) }
	m["aws.s3.uploadObject"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsS3UploadObject(ctx, params, notifier) }
	m["aws.s3.deleteObject"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsS3DeleteObject(ctx, params, notifier) }
	m["aws.s3.createBucket"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsS3CreateBucket(ctx, params, notifier) }
	m["aws.s3.copyObject"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsS3CopyObject(ctx, params, notifier) }
	m["aws.s3.createFolderPrefix"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsS3CreateFolderPrefix(ctx, params, notifier) }
	m["aws.s3.presignObject"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsS3PresignObject(ctx, params, notifier) }
	m["aws.s3.analyseUrl"] = func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleAwsS3AnalyseUrl(params) }
	m["aws.s3.validateUrl"] = func(_ context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsS3ValidateUrl(params, notifier) }
	m["aws.ec2.selectRegion"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsEc2SelectRegion(ctx, params, notifier) }
	m["aws.ec2.selectInstance"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsEc2SelectInstance(ctx, params, notifier) }
	m["aws.ec2.invokeAction"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsEc2InvokeAction(ctx, params, notifier) }
	m["aws.ec2.runInstances"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsEc2RunInstances(ctx, params, notifier) }
	m["aws.ec2.terminateInstances"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsEc2TerminateInstances(ctx, params, notifier) }
	m["aws.lambda.selectRegion"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsLambdaSelectRegion(ctx, params, notifier) }
	m["aws.lambda.selectFunction"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsLambdaSelectFunction(ctx, params, notifier) }
	m["aws.dynamodb.selectRegion"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsDynamodbSelectRegion(ctx, params, notifier) }
	m["aws.dynamodb.selectTable"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsDynamodbSelectTable(ctx, params, notifier) }
	m["aws.dynamodb.putItem"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsDynamodbPutItem(ctx, params, notifier) }
	m["aws.dynamodb.deleteItem"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsDynamodbDeleteItem(ctx, params, notifier) }
	m["aws.sqs.selectRegion"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsSqsSelectRegion(ctx, params, notifier) }
	m["aws.sqs.selectQueue"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsSqsSelectQueue(ctx, params, notifier) }
	m["aws.sqs.peek"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsSqsPeek(ctx, params, notifier) }
	m["aws.sqs.sendMessage"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsSqsSendMessage(ctx, params, notifier) }
	m["aws.sqs.createQueue"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsSqsCreateQueue(ctx, params, notifier) }
	m["aws.sns.selectRegion"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsSnsSelectRegion(ctx, params, notifier) }
	m["aws.sns.selectTopic"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsSnsSelectTopic(ctx, params, notifier) }
	m["aws.sns.publish"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsSnsPublish(ctx, params, notifier) }
	m["aws.sns.createTopic"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsSnsCreateTopic(ctx, params, notifier) }
	m["aws.rds.selectRegion"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsRdsSelectRegion(ctx, params, notifier) }
	m["aws.rds.selectInstance"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsRdsSelectInstance(ctx, params, notifier) }
	m["aws.ecs.selectRegion"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsEcsSelectRegion(ctx, params, notifier) }
	m["aws.ecs.selectCluster"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsEcsSelectCluster(ctx, params, notifier) }
	m["aws.ecs.selectService"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsEcsSelectService(ctx, params, notifier) }
	m["aws.ecs.selectTask"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsEcsSelectTask(ctx, params, notifier) }
	m["aws.eks.selectRegion"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsEksSelectRegion(ctx, params, notifier) }
	m["aws.eks.selectCluster"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsEksSelectCluster(ctx, params, notifier) }
	m["aws.cloudformation.selectRegion"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsCloudFormationSelectRegion(ctx, params, notifier) }
	m["aws.cloudformation.selectStack"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsCloudFormationSelectStack(ctx, params, notifier) }
	m["aws.eventbridge.selectRegion"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsEventBridgeSelectRegion(ctx, params, notifier) }
	m["aws.eventbridge.selectBus"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsEventBridgeSelectBus(ctx, params, notifier) }
	m["aws.route53.selectHostedZone"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsRoute53SelectHostedZone(ctx, params, notifier) }
	m["aws.elb.selectRegion"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsElbv2SelectRegion(ctx, params, notifier) }
	m["aws.elb.selectLoadBalancer"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsElbv2SelectLoadBalancer(ctx, params, notifier) }
	m["aws.kms.selectRegion"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsKmsSelectRegion(ctx, params, notifier) }
	m["aws.kms.selectKey"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsKmsSelectKey(ctx, params, notifier) }
	m["aws.apigateway.selectRegion"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsApiGatewaySelectRegion(ctx, params, notifier) }
	m["aws.apigateway.selectApi"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsApiGatewaySelectApi(ctx, params, notifier) }
	m["aws.secrets.selectRegion"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsSecretsManagerSelectRegion(ctx, params, notifier) }
	m["aws.secrets.selectSecret"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsSecretsManagerSelectSecret(ctx, params, notifier) }
	m["aws.secrets.reveal"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsSecretsManagerReveal(ctx, params, notifier) }
	m["aws.logs.selectRegion"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsLogsSelectRegion(ctx, params, notifier) }
	m["aws.logs.selectLogGroup"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsLogsSelectLogGroup(ctx, params, notifier) }
	m["aws.iam.selectRole"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsIamSelectRole(ctx, params, notifier) }
	m["aws.lambda.describe"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsLambdaDescribe(ctx, params, notifier) }
	m["aws.lambda.invoke"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsLambdaInvoke(ctx, params, notifier) }
	m["aws.lambda.create"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsLambdaCreate(ctx, params, notifier) }
	m["aws.lambda.deleteFunction"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsLambdaDeleteFunction(ctx, params, notifier) }
	m["aws.rds.startInstance"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsRdsStartInstance(ctx, params, notifier) }
	m["aws.rds.stopInstance"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsRdsStopInstance(ctx, params, notifier) }
	m["aws.logs.createLogGroup"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsLogsCreateLogGroup(ctx, params, notifier) }
	m["aws.logs.putLogEvents"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsLogsPutLogEvents(ctx, params, notifier) }
	m["aws.iam.createRole"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsIamCreateRole(ctx, params, notifier) }
	m["aws.inventory.get"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAwsInventoryGet(ctx, params, notifier) }
	m["azure.inventory.get"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureInventoryGet(ctx, params, notifier) }
	m["azure.selectResourceGroup"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureSelectResourceGroup(ctx, params, notifier) }
	m["azure.selectVirtualMachine"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureSelectVirtualMachine(ctx, params, notifier) }
	m["azure.resourceGroups.create"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureResourceGroupsCreate(ctx, params, notifier) }
	m["azure.resourceGroups.delete"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureResourceGroupsDelete(ctx, params, notifier) }
	m["azure.virtualMachines.invokeAction"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureVirtualMachinesInvokeAction(ctx, params, notifier) }
	m["azure.webApps.select"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureSelectWebApp(ctx, params, notifier) }
	m["azure.webApps.selectSlot"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWebAppsSelectSlot(ctx, params, notifier) }
	m["azure.webApps.createSlot"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWebAppsCreateSlot(ctx, params, notifier) }
	m["azure.webApps.swapSlots"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWebAppsSwapSlots(ctx, params, notifier) }
	m["azure.webApps.create"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWebAppsCreate(ctx, params, notifier) }
	m["azure.webApps.invokeAction"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWebAppsInvokeAction(ctx, params, notifier) }
	m["azure.webApps.setSetting"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWebAppsSetSetting(ctx, params, notifier) }
	m["azure.webApps.deleteSetting"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWebAppsDeleteSetting(ctx, params, notifier) }
	m["azure.storage.selectAccount"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureStorageSelectAccount(ctx, params, notifier) }
	m["azure.storage.selectContainer"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureStorageSelectContainer(ctx, params, notifier) }
	m["azure.storage.selectBlob"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureStorageSelectBlob(ctx, params, notifier) }
	m["azure.storage.setPrefixFilter"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureStorageSetPrefixFilter(ctx, params, notifier) }
	m["azure.storage.createAccount"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureStorageCreateAccount(ctx, params, notifier) }
	m["azure.storage.createContainer"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureStorageCreateContainer(ctx, params, notifier) }
	m["azure.storage.uploadBlob"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureStorageUploadBlob(ctx, params, notifier) }
	m["azure.storage.deleteBlob"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureStorageDeleteBlob(ctx, params, notifier) }
	m["azure.storage.copyBlob"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureStorageCopyBlob(ctx, params, notifier) }
	m["azure.storage.createFolderPrefix"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureStorageCreateFolderPrefix(ctx, params, notifier) }
	m["azure.logAnalytics.selectWorkspace"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureLogAnalyticsSelectWorkspace(ctx, params, notifier) }
	m["azure.logAnalytics.query"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureLogAnalyticsQuery(ctx, params, notifier) }
	m["azure.logAnalytics.history.list"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureLogAnalyticsHistoryList(ctx, params, notifier) }
	m["azure.logAnalytics.saved.list"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureLogAnalyticsSavedList(ctx, params, notifier) }
	m["azure.logAnalytics.saved.save"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureLogAnalyticsSavedSave(ctx, params, notifier) }
	m["azure.logAnalytics.saved.delete"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureLogAnalyticsSavedDelete(ctx, params, notifier) }
	m["azure.logAnalytics.tables.list"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureLogAnalyticsTablesList(ctx, params, notifier) }
	m["azure.logAnalytics.table.schema"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureLogAnalyticsTableSchema(ctx, params, notifier) }
	m["azure.waf.logs.schema"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWafLogsSchema(ctx, params, notifier) }
	m["azure.waf.refresh"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWafRefresh(ctx, params, notifier) }
	m["azure.waf.selectPolicy"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWafSelectPolicy(ctx, params, notifier) }
	m["azure.waf.config.setMode"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWafConfigSetMode(ctx, params, notifier) }
	m["azure.waf.config.setManagedRule"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWafConfigSetManagedRule(ctx, params, notifier) }
	m["azure.waf.config.addExclusion"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWafConfigAddExclusion(ctx, params, notifier) }
	m["azure.waf.config.removeExclusion"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWafConfigRemoveExclusion(ctx, params, notifier) }
	m["azure.frontDoor.selectProfile"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureFrontDoorSelectProfile(ctx, params, notifier) }
	m["azure.frontDoor.selectEndpoint"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureFrontDoorSelectEndpoint(ctx, params, notifier) }
	m["azure.frontDoor.selectOriginGroup"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureFrontDoorSelectOriginGroup(ctx, params, notifier) }
	m["azure.frontDoor.refresh"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureFrontDoorRefresh(ctx, params, notifier) }
	m["azure.frontDoor.purgeCache"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureFrontDoorPurgeCache(ctx, params, notifier) }
	m["azure.functions.selectApp"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureFunctionsSelectApp(ctx, params, notifier) }
	m["azure.functions.selectFunction"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureFunctionsSelectFunction(ctx, params, notifier) }
	m["azure.functions.invoke"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureFunctionsInvoke(ctx, params, notifier) }
	m["azure.keyVault.selectVault"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureKeyVaultSelectVault(ctx, params, notifier) }
	m["azure.keyVault.selectSecret"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureKeyVaultSelectSecret(ctx, params, notifier) }
	m["azure.keyVault.revealSecret"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureKeyVaultRevealSecret(ctx, params, notifier) }
	m["azure.keyVault.setSecret"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureKeyVaultSetSecret(ctx, params, notifier) }
	m["azure.cosmos.selectAccount"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureCosmosSelectAccount(ctx, params, notifier) }
	m["azure.cosmos.selectDatabase"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureCosmosSelectDatabase(ctx, params, notifier) }
	m["azure.cosmos.selectContainer"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureCosmosSelectContainer(ctx, params, notifier) }
	m["azure.postgres.selectServer"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzurePostgresSelectServer(ctx, params, notifier) }
	m["azure.queues.selectQueue"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureQueuesSelectQueue(ctx, params, notifier) }
	m["azure.bastion.list"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureBastionList(ctx, params, notifier) }
	m["azure.bastion.connect"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureBastionConnect(ctx, params, notifier) }
	m["session.selectProvider"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleSessionSelectProvider(ctx, params, notifier) }
	m["session.selectProfile"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleSessionSelectProfile(ctx, params, notifier) }
	m["session.selectAuthMethod"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleSessionSelectAuthMethod(ctx, params, notifier) }
	m["session.lock"] = func(ctx context.Context, _ json.RawMessage, notifier Notifier) (any, error) { return s.handleSessionLock(ctx, notifier) }
	m["session.setWriteMode"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleSessionSetWriteMode(ctx, params, notifier) }
	m["session.unlock"] = func(ctx context.Context, _ json.RawMessage, notifier Notifier) (any, error) { return s.handleSessionUnlock(ctx, notifier) }
	m["logs.list"] = func(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleLogsList(ctx, params) }
	m["app.settings.get"] = func(_ context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.handleAppSettingsGet() }
	m["preferences.get"] = func(_ context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.handlePreferencesGet() }
	m["preferences.update"] = func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handlePreferencesUpdate(params) }
	m["preferences.hiddenResources.get"] = func(ctx context.Context, _ json.RawMessage, notifier Notifier) (any, error) { return s.handlePreferencesHiddenResourcesGet(ctx, notifier) }
	m["app.reset"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAppReset(ctx, params, notifier) }
	m["docker.runtime.get"] = func(_ context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.handleDockerRuntimeGet() }
	m["docker.resources.list"] = func(_ context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.handleDockerResourcesList() }
	m["emulators.list"] = func(_ context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.handleEmulatorsList() }
	m["emulators.prepareProfile"] = func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleEmulatorsPrepareProfile(params) }
	m["emulators.start"] = func(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleEmulatorsStart(ctx, params) }
	m["emulators.stop"] = func(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleEmulatorsStop(ctx, params) }
	m["emulators.logs"] = func(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleEmulatorsLogs(ctx, params) }
	m["actions.invoke"] = func(_ context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleActionsInvoke(params, notifier) }
	m["recipes.list"] = func(_ context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.recipes.List() }
	m["recipes.get"] = func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleRecipesGet(params) }
	m["recipes.import"] = func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleRecipesImport(params) }
	m["recipes.validate"] = func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleRecipesValidate(params) }
	m["recipes.scaffold"] = func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleRecipesScaffold(params) }
	m["tofu.status"] = func(ctx context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.tofuStatus(ctx), nil }
	m["tofu.install"] = func(_ context.Context, _ json.RawMessage, notifier Notifier) (any, error) { return s.handleTofuInstall(notifier) }
	m["deployments.list"] = func(ctx context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.deploymentsList(ctx) }
	m["deployments.get"] = func(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleDeploymentsGet(ctx, params) }
	m["deployments.plan"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleDeploymentsPlan(ctx, params, notifier) }
	m["deployments.apply"] = func(_ context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleDeploymentsApply(params, notifier) }
	m["deployments.destroy"] = func(_ context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleDeploymentsDestroy(params, notifier) }
	m["deployments.checkDrift"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleDeploymentsCheckDrift(ctx, params, notifier) }
	m["deployments.cancel"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleDeploymentsCancel(ctx, params, notifier) }
	m["deployments.delete"] = func(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleDeploymentsDelete(ctx, params) }
	m["deployments.retryPostApply"] = func(_ context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleDeploymentsRetryPostApply(params, notifier) }
	m["labs.start"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleLabsStart(ctx, params, notifier) }
	m["labs.get"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleLabsGet(ctx, params, notifier) }
	m["labs.verifyStep"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleLabsVerifyStep(ctx, params, notifier) }
	m["labs.runAction"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleLabsRunAction(ctx, params, notifier) }
	m["labs.reset"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleLabsReset(ctx, params, notifier) }
}

// RegisteredMethods returns the sorted list of RPC method names (for tests and docs).
func (s *Service) RegisteredMethods() []string {
	handlers := s.methodHandlers()
	names := make([]string, 0, len(handlers))
	for name := range handlers {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}
