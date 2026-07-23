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
	// handlers maps JSON-RPC method names to handlers (built once).
	handlersOnce sync.Once
	handlers     map[string]RPCHandler
}

// runtimeStatus is the Docker and emulator bundle embedded in every workspace
// snapshot. Cached briefly so interactive selection handlers avoid live probes.
type runtimeStatus struct {
	Docker    models.DockerRuntimeSnapshot
	Resources []models.ManagedDockerResource
	Emulators []models.EmulatorSummary
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
	localStackMgr := localstack.NewManager(settings)
	azureRuntime := flociaz.NewManager(settings)
	return NewWithRuntimes(settings, store, discoveryService, s3Inventory, ec2Inventory, lambdaInventory, dynamodbInventory, sqsInventory, snsInventory, rdsInventory, ecsInventory, eksInventory, cloudformationInventory, eventbridgeInventory, route53Inventory, elbv2Inventory, kmsInventory, apigatewayInventory, secretsManagerInventory, logsInventory, iamInventory, azureInventory, dockerRuntime, localStackMgr, azureRuntime)
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
	recipeLoader := recipes.Bundled().WithImportedDir(settings.ImportedRecipesDir)
	deployEngine := deploy.NewEngine(tofu.NewRunner(tofu.Resolve(settings)), settings, recipeLoader)
	cipher, cipherErr := loadCipher(settings.SecretKeyPath)
	service := &Service{
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
		ecs:                   ecsInventory,
		eks:                   eksInventory,
		cloudformation:        cloudformationInventory,
		eventbridge:           eventbridgeInventory,
		route53:               route53Inventory,
		elbv2:                 elbv2Inventory,
		kms:                   kmsInventory,
		apigateway:            apigatewayInventory,
		secretsManager:        secretsManagerInventory,
		logs:                  logsInventory,
		iam:                   iamInventory,
		azure:                 azureInventory,
		docker:                dockerRuntime,
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
