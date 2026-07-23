// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/flociaz"
	"cloudsprocket/backend/daemon/internal/labs"
	"cloudsprocket/backend/daemon/internal/localstack"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/recipes"
	"cloudsprocket/backend/daemon/internal/secrets"
	"cloudsprocket/backend/daemon/internal/store"
	"cloudsprocket/backend/daemon/internal/tofu"
)

type Service struct {
	settings              config.Settings
	store                 *store.Store
	discovery             *discovery.Service
	s3                    S3Inventory
	ec2                   EC2Inventory
	lambda                LambdaInventory
	dynamodb              DynamoDBInventory
	sqs                   SQSInventory
	sns                   SNSInventory
	rds                   RDSInventory
	ecs                   ECSInventory
	eks                   EKSInventory
	cloudformation        CloudFormationInventory
	eventbridge           EventBridgeInventory
	route53               Route53Inventory
	elbv2                 Elbv2Inventory
	kms                   KmsInventory
	apigateway            ApiGatewayInventory
	secretsManager        SecretsManagerInventory
	logs                  LogsInventory
	iam                   IAMInventory
	azure                 AzureInventory
	docker                DockerRuntime
	localstackMgr         LocalStackManager
	azureRuntime          AzureRuntimeManager
	recipes               *recipes.Loader
	deployer              Deployer
	cipher                *secrets.Cipher
	initialisationErr     error
	azureInventoryTimeout time.Duration
	dockerSnapshotMu      sync.Mutex
	dockerSnapshotValue   *models.DockerRuntimeSnapshot
	dockerSnapshotAt      time.Time
	// runtimeStatus* caches the Docker + managed-resources + emulator bundle used
	// by workspace snapshots so selection RPCs do not re-probe live runtimes on
	// every click. Dedicated runtime.get and manual Docker refresh keep their own
	// live paths and seed or invalidate this cache.
	runtimeStatusMu    sync.Mutex
	runtimeStatusValue *runtimeStatus
	runtimeStatusAt    time.Time
	// azureCLIExt* caches az extension list output per profile. The check shells
	// out to a Python CLI and can take seconds; it does not need to run on every
	// workspace snapshot for the same profile.
	azureCLIExtMu        sync.Mutex
	azureCLIExtProfileID string
	azureCLIExtStatuses  []models.AzureCLIExtensionStatus
	azureCLIExtAt        time.Time
	deployCancelsMu      sync.Mutex
	deployCancels        map[string]context.CancelFunc
	labRunnerOnce        sync.Once
	labRunnerValue       *labs.Runner
	preferences          models.ServicePreferences
	now                  func() time.Time
	mu                   sync.Mutex
}

// runtimeStatus is the Docker and emulator bundle embedded in every workspace
// snapshot. Cached briefly so interactive selection handlers avoid live probes.
type runtimeStatus struct {
	Docker    models.DockerRuntimeSnapshot
	Resources []models.ManagedDockerResource
	Emulators []models.EmulatorSummary
}

// Deps holds the collaborators required to construct a Service.
// Prefer NewFromDeps for production wiring so call sites stay labelled and
// new inventory interfaces do not lengthen positional constructor argument lists.
type Deps struct {
	Settings       config.Settings
	Store          *store.Store
	Discovery      *discovery.Service
	S3             S3Inventory
	EC2            EC2Inventory
	Lambda         LambdaInventory
	DynamoDB       DynamoDBInventory
	SQS            SQSInventory
	SNS            SNSInventory
	RDS            RDSInventory
	ECS            ECSInventory
	EKS            EKSInventory
	CloudFormation CloudFormationInventory
	EventBridge    EventBridgeInventory
	Route53        Route53Inventory
	Elbv2          Elbv2Inventory
	Kms            KmsInventory
	ApiGateway     ApiGatewayInventory
	SecretsManager SecretsManagerInventory
	Logs           LogsInventory
	IAM            IAMInventory
	Azure          AzureInventory
	Docker         DockerRuntime
	LocalStack     LocalStackManager
	AzureRuntime   AzureRuntimeManager
}

// NewFromDeps constructs a Service from an explicit dependency set.
// When LocalStack or AzureRuntime is nil, production defaults are created from Settings
// (same behaviour as New).
func NewFromDeps(deps Deps) *Service {
	localStackMgr := deps.LocalStack
	if localStackMgr == nil {
		localStackMgr = localstack.NewManager(deps.Settings)
	}
	azureRuntime := deps.AzureRuntime
	if azureRuntime == nil {
		azureRuntime = flociaz.NewManager(deps.Settings)
	}

	recipeLoader := recipes.Bundled().WithImportedDir(deps.Settings.ImportedRecipesDir)
	deployEngine := deploy.NewEngine(tofu.NewRunner(tofu.Resolve(deps.Settings)), deps.Settings, recipeLoader)
	cipher, cipherErr := loadCipher(deps.Settings.SecretKeyPath)
	service := &Service{
		settings:              deps.Settings,
		store:                 deps.Store,
		discovery:             deps.Discovery,
		s3:                    deps.S3,
		ec2:                   deps.EC2,
		lambda:                deps.Lambda,
		dynamodb:              deps.DynamoDB,
		sqs:                   deps.SQS,
		sns:                   deps.SNS,
		rds:                   deps.RDS,
		ecs:                   deps.ECS,
		eks:                   deps.EKS,
		cloudformation:        deps.CloudFormation,
		eventbridge:           deps.EventBridge,
		route53:               deps.Route53,
		elbv2:                 deps.Elbv2,
		kms:                   deps.Kms,
		apigateway:            deps.ApiGateway,
		secretsManager:        deps.SecretsManager,
		logs:                  deps.Logs,
		iam:                   deps.IAM,
		azure:                 deps.Azure,
		docker:                deps.Docker,
		localstackMgr:         localStackMgr,
		azureRuntime:          azureRuntime,
		recipes:               recipeLoader,
		deployer:              deployEngine,
		cipher:                cipher,
		initialisationErr:     cipherErr,
		azureInventoryTimeout: defaultAzureInventoryTimeout,
		preferences:           defaultServicePreferences(),
		now:                   func() time.Time { return time.Now().UTC() },
	}
	service.mu.Lock()
	if err := service.loadPreferencesLocked(); err != nil {
		log.Printf("preferences: could not load %s, using defaults: %v", service.preferencesPath(), err)
		service.preferences = defaultServicePreferences()
	}
	service.mu.Unlock()
	if service.initialisationErr == nil && service.store != nil {
		recoveryCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := service.recoverLabFaults(recoveryCtx); err != nil {
			log.Printf("labs: could not recover active faults at startup: %v", err)
		}
	}
	return service
}

// New constructs a Service with default LocalStack and floci-az managers.
// Prefer NewFromDeps for new call sites; this wrapper keeps existing tests stable.
func New(
	settings config.Settings,
	store *store.Store,
	discoveryService *discovery.Service,
	s3Inventory S3Inventory,
	ec2Inventory EC2Inventory,
	lambdaInventory LambdaInventory,
	dynamodbInventory DynamoDBInventory,
	sqsInventory SQSInventory,
	snsInventory SNSInventory,
	rdsInventory RDSInventory,
	ecsInventory ECSInventory,
	eksInventory EKSInventory,
	cloudformationInventory CloudFormationInventory,
	eventbridgeInventory EventBridgeInventory,
	route53Inventory Route53Inventory,
	elbv2Inventory Elbv2Inventory,
	kmsInventory KmsInventory,
	apigatewayInventory ApiGatewayInventory,
	secretsManagerInventory SecretsManagerInventory,
	logsInventory LogsInventory,
	iamInventory IAMInventory,
	azureInventory AzureInventory,
	dockerRuntime DockerRuntime,
) *Service {
	return NewFromDeps(Deps{
		Settings:       settings,
		Store:          store,
		Discovery:      discoveryService,
		S3:             s3Inventory,
		EC2:            ec2Inventory,
		Lambda:         lambdaInventory,
		DynamoDB:       dynamodbInventory,
		SQS:            sqsInventory,
		SNS:            snsInventory,
		RDS:            rdsInventory,
		ECS:            ecsInventory,
		EKS:            eksInventory,
		CloudFormation: cloudformationInventory,
		EventBridge:    eventbridgeInventory,
		Route53:        route53Inventory,
		Elbv2:          elbv2Inventory,
		Kms:            kmsInventory,
		ApiGateway:     apigatewayInventory,
		SecretsManager: secretsManagerInventory,
		Logs:           logsInventory,
		IAM:            iamInventory,
		Azure:          azureInventory,
		Docker:         dockerRuntime,
		// LocalStack and AzureRuntime left nil so NewFromDeps applies defaults.
	})
}

// NewWithRuntimes constructs a Service with explicit LocalStack and Azure runtime managers.
// Prefer NewFromDeps for new call sites; this wrapper keeps existing tests stable.
func NewWithRuntimes(
	settings config.Settings,
	store *store.Store,
	discoveryService *discovery.Service,
	s3Inventory S3Inventory,
	ec2Inventory EC2Inventory,
	lambdaInventory LambdaInventory,
	dynamodbInventory DynamoDBInventory,
	sqsInventory SQSInventory,
	snsInventory SNSInventory,
	rdsInventory RDSInventory,
	ecsInventory ECSInventory,
	eksInventory EKSInventory,
	cloudformationInventory CloudFormationInventory,
	eventbridgeInventory EventBridgeInventory,
	route53Inventory Route53Inventory,
	elbv2Inventory Elbv2Inventory,
	kmsInventory KmsInventory,
	apigatewayInventory ApiGatewayInventory,
	secretsManagerInventory SecretsManagerInventory,
	logsInventory LogsInventory,
	iamInventory IAMInventory,
	azureInventory AzureInventory,
	dockerRuntime DockerRuntime,
	localStackMgr LocalStackManager,
	azureRuntime AzureRuntimeManager,
) *Service {
	return NewFromDeps(Deps{
		Settings:       settings,
		Store:          store,
		Discovery:      discoveryService,
		S3:             s3Inventory,
		EC2:            ec2Inventory,
		Lambda:         lambdaInventory,
		DynamoDB:       dynamodbInventory,
		SQS:            sqsInventory,
		SNS:            snsInventory,
		RDS:            rdsInventory,
		ECS:            ecsInventory,
		EKS:            eksInventory,
		CloudFormation: cloudformationInventory,
		EventBridge:    eventbridgeInventory,
		Route53:        route53Inventory,
		Elbv2:          elbv2Inventory,
		Kms:            kmsInventory,
		ApiGateway:     apigatewayInventory,
		SecretsManager: secretsManagerInventory,
		Logs:           logsInventory,
		IAM:            iamInventory,
		Azure:          azureInventory,
		Docker:         dockerRuntime,
		LocalStack:     localStackMgr,
		AzureRuntime:   azureRuntime,
	})
}

// InitialisationError reports a startup condition that makes it unsafe to
// serve requests. The daemon checks this before starting RPC, and Handle keeps
// the same fail-closed guarantee for alternate embedders.
func (s *Service) InitialisationError() error {
	return s.initialisationErr
}

func (s *Service) Handle(
	ctx context.Context,
	method string,
	params json.RawMessage,
	notifier Notifier,
) (any, error) {
	if s.initialisationErr != nil {
		return nil, fmt.Errorf("service initialisation failed: %w", s.initialisationErr)
	}
	switch method {
	case "providers.list":
		return s.handleProvidersList()
	case "profiles.list":
		return s.handleProfilesList(params)
	case "session.get":
		return s.handleSessionGet(ctx, notifier)
	case "workspace.get":
		return s.handleWorkspaceGet(ctx, notifier)
	case "runtime.get":
		return s.handleRuntimeGet()
	case "aws.s3.selectBucket":
		return s.handleAwsS3SelectBucket(ctx, params, notifier)
	case "aws.s3.selectObject":
		return s.handleAwsS3SelectObject(ctx, params, notifier)
	case "aws.s3.setPrefixFilter":
		return s.handleAwsS3SetPrefixFilter(ctx, params, notifier)
	case "aws.s3.loadMoreObjects":
		return s.handleAwsS3LoadMoreObjects(ctx, params, notifier)
	case "aws.s3.uploadObject":
		return s.handleAwsS3UploadObject(ctx, params, notifier)
	case "aws.s3.deleteObject":
		return s.handleAwsS3DeleteObject(ctx, params, notifier)
	case "aws.s3.createBucket":
		return s.handleAwsS3CreateBucket(ctx, params, notifier)
	case "aws.s3.copyObject":
		return s.handleAwsS3CopyObject(ctx, params, notifier)
	case "aws.s3.createFolderPrefix":
		return s.handleAwsS3CreateFolderPrefix(ctx, params, notifier)
	case "aws.s3.presignObject":
		return s.handleAwsS3PresignObject(ctx, params, notifier)
	case "aws.s3.analyseUrl":
		return s.handleAwsS3AnalyseUrl(params)
	case "aws.s3.validateUrl":
		return s.handleAwsS3ValidateUrl(params, notifier)
	case "aws.ec2.selectRegion":
		return s.handleAwsEc2SelectRegion(ctx, params, notifier)
	case "aws.ec2.selectInstance":
		return s.handleAwsEc2SelectInstance(ctx, params, notifier)
	case "aws.ec2.invokeAction":
		return s.handleAwsEc2InvokeAction(ctx, params, notifier)
	case "aws.ec2.runInstances":
		return s.handleAwsEc2RunInstances(ctx, params, notifier)
	case "aws.ec2.terminateInstances":
		return s.handleAwsEc2TerminateInstances(ctx, params, notifier)
	case "aws.lambda.selectRegion":
		return s.handleAwsLambdaSelectRegion(ctx, params, notifier)
	case "aws.lambda.selectFunction":
		return s.handleAwsLambdaSelectFunction(ctx, params, notifier)
	case "aws.dynamodb.selectRegion":
		return s.handleAwsDynamodbSelectRegion(ctx, params, notifier)
	case "aws.dynamodb.selectTable":
		return s.handleAwsDynamodbSelectTable(ctx, params, notifier)
	case "aws.dynamodb.putItem":
		return s.handleAwsDynamodbPutItem(ctx, params, notifier)
	case "aws.dynamodb.deleteItem":
		return s.handleAwsDynamodbDeleteItem(ctx, params, notifier)
	case "aws.sqs.selectRegion":
		return s.handleAwsSqsSelectRegion(ctx, params, notifier)
	case "aws.sqs.selectQueue":
		return s.handleAwsSqsSelectQueue(ctx, params, notifier)
	case "aws.sqs.peek":
		return s.handleAwsSqsPeek(ctx, params, notifier)
	case "aws.sqs.sendMessage":
		return s.handleAwsSqsSendMessage(ctx, params, notifier)
	case "aws.sqs.createQueue":
		return s.handleAwsSqsCreateQueue(ctx, params, notifier)
	case "aws.sns.selectRegion":
		return s.handleAwsSnsSelectRegion(ctx, params, notifier)
	case "aws.sns.selectTopic":
		return s.handleAwsSnsSelectTopic(ctx, params, notifier)
	case "aws.sns.publish":
		return s.handleAwsSnsPublish(ctx, params, notifier)
	case "aws.sns.createTopic":
		return s.handleAwsSnsCreateTopic(ctx, params, notifier)
	case "aws.rds.selectRegion":
		return s.handleAwsRdsSelectRegion(ctx, params, notifier)
	case "aws.rds.selectInstance":
		return s.handleAwsRdsSelectInstance(ctx, params, notifier)
	case "aws.ecs.selectRegion":
		return s.handleAwsEcsSelectRegion(ctx, params, notifier)
	case "aws.ecs.selectCluster":
		return s.handleAwsEcsSelectCluster(ctx, params, notifier)
	case "aws.ecs.selectService":
		return s.handleAwsEcsSelectService(ctx, params, notifier)
	case "aws.ecs.selectTask":
		return s.handleAwsEcsSelectTask(ctx, params, notifier)
	case "aws.eks.selectRegion":
		return s.handleAwsEksSelectRegion(ctx, params, notifier)
	case "aws.eks.selectCluster":
		return s.handleAwsEksSelectCluster(ctx, params, notifier)
	case "aws.cloudformation.selectRegion":
		return s.handleAwsCloudFormationSelectRegion(ctx, params, notifier)
	case "aws.cloudformation.selectStack":
		return s.handleAwsCloudFormationSelectStack(ctx, params, notifier)
	case "aws.eventbridge.selectRegion":
		return s.handleAwsEventBridgeSelectRegion(ctx, params, notifier)
	case "aws.eventbridge.selectBus":
		return s.handleAwsEventBridgeSelectBus(ctx, params, notifier)
	case "aws.route53.selectHostedZone":
		return s.handleAwsRoute53SelectHostedZone(ctx, params, notifier)
	case "aws.elb.selectRegion":
		return s.handleAwsElbv2SelectRegion(ctx, params, notifier)
	case "aws.elb.selectLoadBalancer":
		return s.handleAwsElbv2SelectLoadBalancer(ctx, params, notifier)
	case "aws.kms.selectRegion":
		return s.handleAwsKmsSelectRegion(ctx, params, notifier)
	case "aws.kms.selectKey":
		return s.handleAwsKmsSelectKey(ctx, params, notifier)
	case "aws.apigateway.selectRegion":
		return s.handleAwsApiGatewaySelectRegion(ctx, params, notifier)
	case "aws.apigateway.selectApi":
		return s.handleAwsApiGatewaySelectApi(ctx, params, notifier)
	case "aws.secrets.selectRegion":
		return s.handleAwsSecretsManagerSelectRegion(ctx, params, notifier)
	case "aws.secrets.selectSecret":
		return s.handleAwsSecretsManagerSelectSecret(ctx, params, notifier)
	case "aws.secrets.reveal":
		return s.handleAwsSecretsManagerReveal(ctx, params, notifier)
	case "aws.logs.selectRegion":
		return s.handleAwsLogsSelectRegion(ctx, params, notifier)
	case "aws.logs.selectLogGroup":
		return s.handleAwsLogsSelectLogGroup(ctx, params, notifier)
	case "aws.iam.selectRole":
		return s.handleAwsIamSelectRole(ctx, params, notifier)
	case "aws.lambda.describe":
		return s.handleAwsLambdaDescribe(ctx, params, notifier)
	case "aws.lambda.invoke":
		return s.handleAwsLambdaInvoke(ctx, params, notifier)
	case "aws.lambda.create":
		return s.handleAwsLambdaCreate(ctx, params, notifier)
	case "aws.lambda.deleteFunction":
		return s.handleAwsLambdaDeleteFunction(ctx, params, notifier)
	case "aws.rds.startInstance":
		return s.handleAwsRdsStartInstance(ctx, params, notifier)
	case "aws.rds.stopInstance":
		return s.handleAwsRdsStopInstance(ctx, params, notifier)
	case "aws.logs.createLogGroup":
		return s.handleAwsLogsCreateLogGroup(ctx, params, notifier)
	case "aws.logs.putLogEvents":
		return s.handleAwsLogsPutLogEvents(ctx, params, notifier)
	case "aws.iam.createRole":
		return s.handleAwsIamCreateRole(ctx, params, notifier)
	case "aws.inventory.get":
		return s.handleAwsInventoryGet(ctx, params, notifier)
	case "azure.inventory.get":
		return s.handleAzureInventoryGet(ctx, params, notifier)
	case "azure.selectResourceGroup":
		return s.handleAzureSelectResourceGroup(ctx, params, notifier)
	case "azure.selectVirtualMachine":
		return s.handleAzureSelectVirtualMachine(ctx, params, notifier)
	case "azure.resourceGroups.create":
		return s.handleAzureResourceGroupsCreate(ctx, params, notifier)
	case "azure.resourceGroups.delete":
		return s.handleAzureResourceGroupsDelete(ctx, params, notifier)
	case "azure.virtualMachines.invokeAction":
		return s.handleAzureVirtualMachinesInvokeAction(ctx, params, notifier)
	case "azure.webApps.select":
		return s.handleAzureSelectWebApp(ctx, params, notifier)
	case "azure.webApps.selectSlot":
		return s.handleAzureWebAppsSelectSlot(ctx, params, notifier)
	case "azure.webApps.createSlot":
		return s.handleAzureWebAppsCreateSlot(ctx, params, notifier)
	case "azure.webApps.swapSlots":
		return s.handleAzureWebAppsSwapSlots(ctx, params, notifier)
	case "azure.webApps.create":
		return s.handleAzureWebAppsCreate(ctx, params, notifier)
	case "azure.webApps.invokeAction":
		return s.handleAzureWebAppsInvokeAction(ctx, params, notifier)
	case "azure.webApps.setSetting":
		return s.handleAzureWebAppsSetSetting(ctx, params, notifier)
	case "azure.webApps.deleteSetting":
		return s.handleAzureWebAppsDeleteSetting(ctx, params, notifier)
	case "azure.storage.selectAccount":
		return s.handleAzureStorageSelectAccount(ctx, params, notifier)
	case "azure.storage.selectContainer":
		return s.handleAzureStorageSelectContainer(ctx, params, notifier)
	case "azure.storage.selectBlob":
		return s.handleAzureStorageSelectBlob(ctx, params, notifier)
	case "azure.storage.setPrefixFilter":
		return s.handleAzureStorageSetPrefixFilter(ctx, params, notifier)
	case "azure.storage.createAccount":
		return s.handleAzureStorageCreateAccount(ctx, params, notifier)
	case "azure.storage.createContainer":
		return s.handleAzureStorageCreateContainer(ctx, params, notifier)
	case "azure.storage.uploadBlob":
		return s.handleAzureStorageUploadBlob(ctx, params, notifier)
	case "azure.storage.deleteBlob":
		return s.handleAzureStorageDeleteBlob(ctx, params, notifier)
	case "azure.storage.copyBlob":
		return s.handleAzureStorageCopyBlob(ctx, params, notifier)
	case "azure.storage.createFolderPrefix":
		return s.handleAzureStorageCreateFolderPrefix(ctx, params, notifier)
	case "azure.logAnalytics.selectWorkspace":
		return s.handleAzureLogAnalyticsSelectWorkspace(ctx, params, notifier)
	case "azure.logAnalytics.query":
		return s.handleAzureLogAnalyticsQuery(ctx, params, notifier)
	case "azure.logAnalytics.history.list":
		return s.handleAzureLogAnalyticsHistoryList(ctx, params, notifier)
	case "azure.logAnalytics.saved.list":
		return s.handleAzureLogAnalyticsSavedList(ctx, params, notifier)
	case "azure.logAnalytics.saved.save":
		return s.handleAzureLogAnalyticsSavedSave(ctx, params, notifier)
	case "azure.logAnalytics.saved.delete":
		return s.handleAzureLogAnalyticsSavedDelete(ctx, params, notifier)
	case "azure.logAnalytics.tables.list":
		return s.handleAzureLogAnalyticsTablesList(ctx, params, notifier)
	case "azure.logAnalytics.table.schema":
		return s.handleAzureLogAnalyticsTableSchema(ctx, params, notifier)
	case "azure.waf.logs.schema":
		return s.handleAzureWafLogsSchema(ctx, params, notifier)
	case "azure.waf.refresh":
		return s.handleAzureWafRefresh(ctx, params, notifier)
	case "azure.waf.selectPolicy":
		return s.handleAzureWafSelectPolicy(ctx, params, notifier)
	case "azure.waf.config.setMode":
		return s.handleAzureWafConfigSetMode(ctx, params, notifier)
	case "azure.waf.config.setManagedRule":
		return s.handleAzureWafConfigSetManagedRule(ctx, params, notifier)
	case "azure.waf.config.addExclusion":
		return s.handleAzureWafConfigAddExclusion(ctx, params, notifier)
	case "azure.waf.config.removeExclusion":
		return s.handleAzureWafConfigRemoveExclusion(ctx, params, notifier)
	case "azure.frontDoor.selectProfile":
		return s.handleAzureFrontDoorSelectProfile(ctx, params, notifier)
	case "azure.frontDoor.selectEndpoint":
		return s.handleAzureFrontDoorSelectEndpoint(ctx, params, notifier)
	case "azure.frontDoor.selectOriginGroup":
		return s.handleAzureFrontDoorSelectOriginGroup(ctx, params, notifier)
	case "azure.frontDoor.refresh":
		return s.handleAzureFrontDoorRefresh(ctx, params, notifier)
	case "azure.frontDoor.purgeCache":
		return s.handleAzureFrontDoorPurgeCache(ctx, params, notifier)
	case "azure.functions.selectApp":
		return s.handleAzureFunctionsSelectApp(ctx, params, notifier)
	case "azure.functions.selectFunction":
		return s.handleAzureFunctionsSelectFunction(ctx, params, notifier)
	case "azure.functions.invoke":
		return s.handleAzureFunctionsInvoke(ctx, params, notifier)
	case "azure.keyVault.selectVault":
		return s.handleAzureKeyVaultSelectVault(ctx, params, notifier)
	case "azure.keyVault.selectSecret":
		return s.handleAzureKeyVaultSelectSecret(ctx, params, notifier)
	case "azure.keyVault.revealSecret":
		return s.handleAzureKeyVaultRevealSecret(ctx, params, notifier)
	case "azure.keyVault.setSecret":
		return s.handleAzureKeyVaultSetSecret(ctx, params, notifier)
	case "azure.cosmos.selectAccount":
		return s.handleAzureCosmosSelectAccount(ctx, params, notifier)
	case "azure.cosmos.selectDatabase":
		return s.handleAzureCosmosSelectDatabase(ctx, params, notifier)
	case "azure.cosmos.selectContainer":
		return s.handleAzureCosmosSelectContainer(ctx, params, notifier)
	case "azure.postgres.selectServer":
		return s.handleAzurePostgresSelectServer(ctx, params, notifier)
	case "azure.queues.selectQueue":
		return s.handleAzureQueuesSelectQueue(ctx, params, notifier)
	case "azure.bastion.list":
		return s.handleAzureBastionList(ctx, params, notifier)
	case "azure.bastion.connect":
		return s.handleAzureBastionConnect(ctx, params, notifier)
	case "session.selectProvider":
		return s.handleSessionSelectProvider(ctx, params, notifier)
	case "session.selectProfile":
		return s.handleSessionSelectProfile(ctx, params, notifier)
	case "session.selectAuthMethod":
		return s.handleSessionSelectAuthMethod(ctx, params, notifier)
	case "session.lock":
		return s.handleSessionLock(ctx, notifier)
	case "session.setWriteMode":
		return s.handleSessionSetWriteMode(ctx, params, notifier)
	case "session.unlock":
		return s.handleSessionUnlock(ctx, notifier)
	case "logs.list":
		return s.handleLogsList(ctx, params)
	case "app.settings.get":
		return s.handleAppSettingsGet()
	case "preferences.get":
		return s.handlePreferencesGet()
	case "preferences.update":
		return s.handlePreferencesUpdate(params)
	case "preferences.hiddenResources.get":
		return s.handlePreferencesHiddenResourcesGet(ctx, notifier)
	case "app.reset":
		return s.handleAppReset(ctx, params, notifier)
	case "docker.runtime.get":
		return s.handleDockerRuntimeGet()
	case "docker.resources.list":
		return s.handleDockerResourcesList()
	case "emulators.list":
		return s.handleEmulatorsList()
	case "emulators.prepareProfile":
		return s.handleEmulatorsPrepareProfile(params)
	case "emulators.start":
		return s.handleEmulatorsStart(ctx, params)
	case "emulators.stop":
		return s.handleEmulatorsStop(ctx, params)
	case "emulators.logs":
		return s.handleEmulatorsLogs(ctx, params)
	case "actions.invoke":
		return s.handleActionsInvoke(params, notifier)
	case "recipes.list":
		return s.recipes.List()
	case "recipes.get":
		return s.handleRecipesGet(params)
	case "recipes.import":
		return s.handleRecipesImport(params)
	case "recipes.validate":
		return s.handleRecipesValidate(params)
	case "recipes.scaffold":
		return s.handleRecipesScaffold(params)
	case "tofu.status":
		return s.tofuStatus(ctx), nil
	case "tofu.install":
		return s.handleTofuInstall(notifier)
	case "deployments.list":
		return s.deploymentsList(ctx)
	case "deployments.get":
		return s.handleDeploymentsGet(ctx, params)
	case "deployments.plan":
		return s.handleDeploymentsPlan(ctx, params, notifier)
	case "deployments.apply":
		return s.handleDeploymentsApply(params, notifier)
	case "deployments.destroy":
		return s.handleDeploymentsDestroy(params, notifier)
	case "deployments.checkDrift":
		return s.handleDeploymentsCheckDrift(ctx, params, notifier)
	case "deployments.cancel":
		return s.handleDeploymentsCancel(ctx, params, notifier)
	case "deployments.delete":
		return s.handleDeploymentsDelete(ctx, params)
	case "deployments.retryPostApply":
		return s.handleDeploymentsRetryPostApply(params, notifier)
	case "labs.start":
		return s.handleLabsStart(ctx, params, notifier)
	case "labs.get":
		return s.handleLabsGet(ctx, params, notifier)
	case "labs.verifyStep":
		return s.handleLabsVerifyStep(ctx, params, notifier)
	case "labs.runAction":
		return s.handleLabsRunAction(ctx, params, notifier)
	case "labs.reset":
		return s.handleLabsReset(ctx, params, notifier)
	default:
		return nil, methodNotFoundError(method)
	}
}
