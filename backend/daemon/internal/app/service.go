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

	appaws "cloudsprocket/backend/daemon/internal/app/aws"
	appdeployment "cloudsprocket/backend/daemon/internal/app/deployment"
	appruntime "cloudsprocket/backend/daemon/internal/app/runtime"
	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/dockerruntime"
	"cloudsprocket/backend/daemon/internal/flociaz"
	"cloudsprocket/backend/daemon/internal/labs"
	"cloudsprocket/backend/daemon/internal/localstack"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/recipes"
	"cloudsprocket/backend/daemon/internal/secrets"
	"cloudsprocket/backend/daemon/internal/store"
	"cloudsprocket/backend/daemon/internal/tofu"
)

const (
	// defaultAzureInventoryTimeout bounds Azure inventory calls (floci-az ARM
	// pager / `az` CLI) so a stalled response cannot hang a workspace snapshot.
	defaultAzureInventoryTimeout = 30 * time.Second
	// azureCLIExtensionCacheTTL bounds az extension list subprocess cost.
	azureCLIExtensionCacheTTL = 10 * time.Minute
)

type Service struct {
	settings       config.Settings
	store          *store.Store
	discovery      *discovery.Service
	s3             S3Inventory
	ec2            EC2Inventory
	lambda         LambdaInventory
	dynamodb       DynamoDBInventory
	sqs            SQSInventory
	sns            SNSInventory
	rds            RDSInventory
	ecs            ECSInventory
	eks            EKSInventory
	cloudformation CloudFormationInventory
	eventbridge    EventBridgeInventory
	route53        Route53Inventory
	elbv2          Elbv2Inventory
	kms            KmsInventory
	apigateway     ApiGatewayInventory
	secretsManager SecretsManagerInventory
	logs           LogsInventory
	iam            IAMInventory
	azure          AzureInventory
	// rt owns Docker probing, emulator lifecycle, and both runtime caches (F-029).
	rt *appruntime.Service
	// deploy owns recipe catalogue helpers, tofu install, deployment lifecycle,
	// and cancel map ownership (F-029 Phase 2).
	deploy *appdeployment.Service
	// aws owns extracted AWS domain RPCs: inventory.get and selection groups (F-029 Phase 4).
	aws                   *appaws.Service
	cipher                *secrets.Cipher
	initialisationErr     error
	azureInventoryTimeout time.Duration
	// azureCLIExt* caches az extension list output per profile. The check shells
	// out to a Python CLI and can take seconds; it does not need to run on every
	// workspace snapshot for the same profile.
	azureCLIExtMu        sync.Mutex
	azureCLIExtProfileID string
	azureCLIExtStatuses  []models.AzureCLIExtensionStatus
	azureCLIExtAt        time.Time
	labRunnerOnce        sync.Once
	labRunnerValue       *labs.Runner
	preferences          models.ServicePreferences
	now                  func() time.Time
	mu                   sync.Mutex
	// handlers maps JSON-RPC method names to handlers (built once).
	handlersOnce sync.Once
	handlers     map[string]RPCHandler
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
	now := func() time.Time { return time.Now().UTC() }
	settings := deps.Settings
	rt := appruntime.New(appruntime.Deps{
		Settings:     settings,
		Docker:       deps.Docker,
		LocalStack:   localStackMgr,
		AzureRuntime: azureRuntime,
		ResolveDockerHost: func() (string, string) {
			return dockerruntime.ResolveDockerHost(settings)
		},
		Now: now,
	})
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
		rt:                    rt,
		cipher:                cipher,
		initialisationErr:     cipherErr,
		azureInventoryTimeout: defaultAzureInventoryTimeout,
		preferences:           defaultServicePreferences(),
		now:                   now,
	}
	service.deploy = appdeployment.New(appdeployment.Deps{
		Settings: settings,
		Store:    deps.Store,
		Recipes:  recipeLoader,
		Deployer: deployEngine,
		Secrets:  deploySecretsAdapter{s: service},
		Now:      now,
	})
	service.aws = appaws.New(appaws.Deps{
		Discovery:   deps.Discovery,
		Session:     service,
		Workspace:   service,
		Activity:    service,
		Invalidator: service,
		Gate:        awsServiceGate{s: service},
		Catalog:     awsScopeCatalog{},
	})
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

// Handle dispatches a JSON-RPC method via the method registry (see rpc_handlers.go).
// New methods must be registered in registerMethodHandlers; unknown names return
// method-not-found without growing a switch here.
func (s *Service) Handle(
	ctx context.Context,
	method string,
	params json.RawMessage,
	notifier Notifier,
) (any, error) {
	if s.initialisationErr != nil {
		return nil, fmt.Errorf("service initialisation failed: %w", s.initialisationErr)
	}
	handler, ok := s.methodHandlers()[method]
	if !ok {
		return nil, methodNotFoundError(method)
	}
	return handler(ctx, params, notifier)
}
