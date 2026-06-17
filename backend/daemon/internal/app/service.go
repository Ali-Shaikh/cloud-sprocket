package app

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/flociaz"
	"cloudsprocket/backend/daemon/internal/localstack"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/recipes"
	"cloudsprocket/backend/daemon/internal/secrets"
	"cloudsprocket/backend/daemon/internal/store"
	"cloudsprocket/backend/daemon/internal/tofu"
)

type Service struct {
	settings      config.Settings
	store         *store.Store
	discovery     *discovery.Service
	s3            S3Inventory
	ec2           EC2Inventory
	lambda        LambdaInventory
	dynamodb      DynamoDBInventory
	sqs           SQSInventory
	sns           SNSInventory
	rds           RDSInventory
	logs          LogsInventory
	iam           IAMInventory
	azure         AzureInventory
	docker        DockerRuntime
	localstackMgr LocalStackManager
	azureRuntime  AzureRuntimeManager
	recipes       *recipes.Loader
	deployer      Deployer
	cipher        *secrets.Cipher
	azureInventoryTimeout time.Duration
	dockerSnapshotMu      sync.Mutex
	dockerSnapshotValue   *models.DockerRuntimeSnapshot
	dockerSnapshotAt      time.Time
	deployCancelsMu       sync.Mutex
	deployCancels         map[string]context.CancelFunc
	now                   func() time.Time
	mu                    sync.Mutex
}

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
	logsInventory LogsInventory,
	iamInventory IAMInventory,
	azureInventory AzureInventory,
	dockerRuntime DockerRuntime,
) *Service {
	localStackMgr := localstack.NewManager(settings)
	azureRuntime := flociaz.NewManager(settings)
	return NewWithRuntimes(settings, store, discoveryService, s3Inventory, ec2Inventory, lambdaInventory, dynamodbInventory, sqsInventory, snsInventory, rdsInventory, logsInventory, iamInventory, azureInventory, dockerRuntime, localStackMgr, azureRuntime)
}

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
	logsInventory LogsInventory,
	iamInventory IAMInventory,
	azureInventory AzureInventory,
	dockerRuntime DockerRuntime,
	localStackMgr LocalStackManager,
	azureRuntime AzureRuntimeManager,
) *Service {
	recipeLoader := recipes.Bundled()
	deployEngine := deploy.NewEngine(tofu.NewRunner(tofu.Resolve(settings)), settings, recipeLoader)
	return &Service{
		settings:              settings,
		store:                 store,
		discovery:             discoveryService,
		s3:                    s3Inventory,
		ec2:                   ec2Inventory,
		lambda:                lambdaInventory,
		dynamodb:              dynamodbInventory,
		sqs:                   sqsInventory,
		sns:                   snsInventory,
		rds:                   rdsInventory,
		logs:                  logsInventory,
		iam:                   iamInventory,
		azure:                 azureInventory,
		docker:                dockerRuntime,
		localstackMgr:         localStackMgr,
		azureRuntime:          azureRuntime,
		recipes:               recipeLoader,
		deployer:              deployEngine,
		cipher:                loadCipher(settings.SecretKeyPath),
		azureInventoryTimeout: defaultAzureInventoryTimeout,
		now:                   func() time.Time { return time.Now().UTC() },
	}
}

func (s *Service) Handle(
	ctx context.Context,
	method string,
	params json.RawMessage,
	notifier Notifier,
) (any, error) {
	switch method {
	case "providers.list":
		return s.handleProvidersList()
	case "profiles.list":
		return s.handleProfilesList(params)
	case "session.get":
		return s.handleSessionGet(ctx, notifier)
	case "workspace.get":
		return s.handleWorkspaceGet(ctx, notifier)
	case "aws.s3.selectBucket":
		return s.handleAwsS3SelectBucket(ctx, params, notifier)
	case "aws.s3.selectObject":
		return s.handleAwsS3SelectObject(ctx, params, notifier)
	case "aws.s3.setPrefixFilter":
		return s.handleAwsS3SetPrefixFilter(ctx, params, notifier)
	case "aws.s3.uploadObject":
		return s.handleAwsS3UploadObject(ctx, params, notifier)
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
	case "aws.lambda.selectRegion":
		return s.handleAwsLambdaSelectRegion(ctx, params, notifier)
	case "aws.lambda.selectFunction":
		return s.handleAwsLambdaSelectFunction(ctx, params, notifier)
	case "aws.dynamodb.selectRegion":
		return s.handleAwsDynamodbSelectRegion(ctx, params, notifier)
	case "aws.dynamodb.selectTable":
		return s.handleAwsDynamodbSelectTable(ctx, params, notifier)
	case "aws.sqs.selectRegion":
		return s.handleAwsSqsSelectRegion(ctx, params, notifier)
	case "aws.sqs.selectQueue":
		return s.handleAwsSqsSelectQueue(ctx, params, notifier)
	case "aws.sqs.peek":
		return s.handleAwsSqsPeek(ctx, params, notifier)
	case "aws.sns.selectRegion":
		return s.handleAwsSnsSelectRegion(ctx, params, notifier)
	case "aws.sns.selectTopic":
		return s.handleAwsSnsSelectTopic(ctx, params, notifier)
	case "aws.rds.selectRegion":
		return s.handleAwsRdsSelectRegion(ctx, params, notifier)
	case "aws.rds.selectInstance":
		return s.handleAwsRdsSelectInstance(ctx, params, notifier)
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
	case "azure.selectResourceGroup":
		return s.handleAzureSelectResourceGroup(ctx, params, notifier)
	case "azure.selectVirtualMachine":
		return s.handleAzureSelectVirtualMachine(ctx, params, notifier)
	case "azure.resourceGroups.create":
		return s.handleAzureResourceGroupsCreate(ctx, params, notifier)
	case "azure.resourceGroups.delete":
		return s.handleAzureResourceGroupsDelete(ctx, params, notifier)
	case "azure.storage.selectAccount":
		return s.handleAzureStorageSelectAccount(ctx, params, notifier)
	case "azure.storage.selectContainer":
		return s.handleAzureStorageSelectContainer(ctx, params, notifier)
	case "azure.storage.selectBlob":
		return s.handleAzureStorageSelectBlob(ctx, params, notifier)
	case "azure.storage.setPrefixFilter":
		return s.handleAzureStorageSetPrefixFilter(ctx, params, notifier)
	case "azure.storage.createContainer":
		return s.handleAzureStorageCreateContainer(ctx, params, notifier)
	case "azure.storage.uploadBlob":
		return s.handleAzureStorageUploadBlob(ctx, params, notifier)
	case "azure.storage.deleteBlob":
		return s.handleAzureStorageDeleteBlob(ctx, params, notifier)
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
	case "deployments.cancel":
		return s.handleDeploymentsCancel(params)
	case "deployments.delete":
		return s.handleDeploymentsDelete(ctx, params)
	case "deployments.retryPostApply":
		return s.handleDeploymentsRetryPostApply(params, notifier)
	default:
		return nil, fmt.Errorf("unknown backend method: %s", method)
	}
}