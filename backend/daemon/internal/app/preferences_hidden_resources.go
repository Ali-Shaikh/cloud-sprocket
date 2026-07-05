// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"sync"
	"time"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

const hiddenResourcesProbeTimeout = 20 * time.Second

func (s *Service) handlePreferencesHiddenResourcesGet(ctx context.Context, _ Notifier) (any, error) {
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	session, err := s.currentState(ctx, snapshot)
	s.mu.Unlock()
	if err != nil {
		return nil, err
	}
	if !session.IsLocked {
		return models.HiddenResourcesSnapshot{}, nil
	}
	providerID := session.LockedProviderID
	if providerID == "" {
		return models.HiddenResourcesSnapshot{}, nil
	}

	probeCtx, cancel := context.WithTimeout(ctx, hiddenResourcesProbeTimeout)
	defer cancel()

	hits, err := s.probeHiddenResources(probeCtx, snapshot, session, providerID)
	if err != nil {
		return nil, err
	}
	return models.HiddenResourcesSnapshot{Hits: hits}, nil
}

func (s *Service) probeHiddenResources(
	ctx context.Context,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	providerID string,
) ([]models.HiddenResourceHit, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	disabled := s.disabledCatalogueEntries(providerID)
	if len(disabled) == 0 {
		return nil, nil
	}

	type probeResult struct {
		hit models.HiddenResourceHit
		ok  bool
	}
	results := make([]probeResult, len(disabled))
	var wg sync.WaitGroup
	for index, entry := range disabled {
		wg.Add(1)
		go func(i int, catalogEntry serviceCatalogEntry) {
			defer wg.Done()
			if ctx.Err() != nil {
				return
			}
			count, found := s.probeCatalogueEntryResources(snapshot, session, catalogEntry)
			if !found || count <= 0 {
				return
			}
			results[i] = probeResult{
				ok: true,
				hit: models.HiddenResourceHit{
					ProviderID:    catalogEntry.ProviderID,
					ServiceID:     catalogEntry.ServiceID,
					Label:         catalogEntry.Label,
					ResourceCount: count,
				},
			}
		}(index, entry)
	}
	wg.Wait()

	hits := make([]models.HiddenResourceHit, 0, len(disabled))
	for _, result := range results {
		if result.ok {
			hits = append(hits, result.hit)
		}
	}
	return hits, nil
}

func (s *Service) disabledCatalogueEntries(providerID string) []serviceCatalogEntry {
	entries := serviceCatalogForProvider(providerID)
	disabled := make([]serviceCatalogEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.Category == workspaceTabCategoryComingSoon {
			continue
		}
		if !s.isServiceEnabled(entry.ProviderID, entry.ServiceID) {
			disabled = append(disabled, entry)
		}
	}
	return disabled
}

func (s *Service) probeCatalogueEntryResources(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	entry serviceCatalogEntry,
) (int, bool) {
	workspace := s.emptyProbeWorkspace(snapshot, session)
	switch entry.ProviderID {
	case "aws":
		if entry.InventoryScope == "" {
			return 0, false
		}
		s.runAwsInventoryEnricher(
			entry.InventoryScope,
			&workspace,
			session,
			awsEnrichmentOptions{lightweight: true},
			nil,
		)
		return countCatalogueResources(&workspace, entry.ProviderID, entry.ServiceID)
	case "azure":
		return s.probeAzureCatalogueEntry(&workspace, session, entry)
	default:
		return 0, false
	}
}

func (s *Service) probeAzureCatalogueEntry(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	entry serviceCatalogEntry,
) (int, bool) {
	scope := entry.InventoryScope
	switch entry.ServiceID {
	case "azure-overview", "azure-resource-groups", "azure-vms":
		s.enrichAzureInventory(workspace, session, nil)
		return countCatalogueResources(workspace, entry.ProviderID, entry.ServiceID)
	case "azure-tools":
		return 0, false
	}
	if scope == "" {
		return 0, false
	}
	s.probeAzureInventoryScope(workspace, session, scope)
	return countCatalogueResources(workspace, entry.ProviderID, entry.ServiceID)
}

func (s *Service) probeAzureInventoryScope(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	scope string,
) {
	scopeOpts := azureEnrichmentOptions{lightweight: true}
	switch scope {
	case "storage":
		s.enrichAzureStorageInventory(workspace, session, scopeOpts, nil)
	case "functions":
		s.enrichAzureFunctionsInventory(workspace, session, scopeOpts, nil)
	case "keyvault":
		s.enrichAzureKeyVaultInventory(workspace, session, scopeOpts, nil)
	case "cosmos":
		s.enrichAzureCosmosInventory(workspace, session, scopeOpts, nil)
	case "postgres":
		s.enrichAzurePostgresInventory(workspace, session, scopeOpts, nil)
	case "loganalytics":
		s.enrichAzureLogAnalyticsInventory(workspace, session, nil)
	case "entra":
		s.enrichAzureEntraInventory(workspace, session, nil)
	case "waf":
		s.enrichAzureLogAnalyticsInventory(workspace, session, nil)
		s.enrichAzureWafInventory(workspace, session, scopeOpts, nil)
	case "queues":
		s.enrichAzureStorageInventory(workspace, session, azureEnrichmentOptions{lightweight: true}, nil)
		s.enrichAzureQueuesInventory(workspace, session, scopeOpts, nil)
	case "webapps":
		s.enrichAzureInventory(workspace, session, nil)
		s.enrichAzureAppServiceInventory(workspace, session, nil)
	case "frontdoor":
		s.enrichAzureFrontDoorInventory(workspace, session, scopeOpts, nil)
	}
}

func (s *Service) emptyProbeWorkspace(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
) models.WorkspaceSnapshot {
	workspace := models.WorkspaceSnapshot{
		S3Buckets:              []models.AwsS3Bucket{},
		EC2Regions:             []string{},
		EC2Instances:           []models.AwsEc2Instance{},
		LambdaRegions:          []string{},
		LambdaFunctions:        []models.AwsLambdaFunction{},
		DynamoDBRegions:        []string{},
		DynamoDBTables:         []models.AwsDynamoDBTable{},
		SQSRegions:             []string{},
		SQSQueues:              []models.AwsSqsQueue{},
		SNSRegions:             []string{},
		SNSTopics:              []models.AwsSnsTopic{},
		RDSRegions:             []string{},
		RDSInstances:           []models.AwsRdsInstance{},
		ECSRegions:             []string{},
		ECSClusters:            []models.AwsEcsCluster{},
		EKSRegions:             []string{},
		EKSClusters:            []models.AwsEksCluster{},
		CloudFormationRegions:  []string{},
		CloudFormationStacks:   []models.AwsCloudFormationStack{},
		EventBridgeRegions:     []string{},
		EventBridgeBuses:       []models.AwsEventBridgeBus{},
		Route53HostedZones:     []models.AwsRoute53HostedZone{},
		ApiGatewayRegions:      []string{},
		ApiGatewayApis:         []models.AwsApiGatewayApi{},
		SecretsManagerRegions:  []string{},
		SecretsManagerSecrets:  []models.AwsSecretsManagerSecret{},
		LogsRegions:            []string{},
		LogGroups:              []models.AwsLogGroup{},
		IAMRoles:               []models.AwsIamRole{},
		IAMPolicies:            []models.AwsIamPolicy{},
		AzureResourceGroups:    []models.AzureResourceGroup{},
		AzureVirtualMachines:   []models.AzureVirtualMachine{},
		AzureStorageAccounts:   []models.AzureStorageAccount{},
		AzureWebApps:           []models.AzureWebApp{},
		AzureFunctionApps:      []models.AzureFunctionApp{},
		AzureKeyVaults:         []models.AzureKeyVault{},
		AzureCosmosAccounts:    []models.AzureCosmosAccount{},
		AzurePostgresServers:   []models.AzurePostgresServer{},
		AzureStorageQueues:     []models.AzureStorageQueue{},
		AzureEntraUsers:        []models.AzureEntraUser{},
		AzureLogAnalyticsWorkspaces: []models.AzureLogAnalyticsWorkspace{},
		AzureWafPolicies:       []models.AzureWafPolicySummary{},
		AzureFrontDoorProfiles: []models.AzureFrontDoorProfile{},
	}
	if provider, ok := findProvider(snapshot.Providers, session.CurrentProviderID); ok {
		workspace.Provider = &provider
	}
	profiles := filterProfiles(snapshot.Profiles, session.CurrentProviderID)
	if profile, ok := findProfile(profiles, session.SelectedProfileID); ok {
		workspace.Profile = &profile
	}
	return workspace
}

func countCatalogueResources(
	workspace *models.WorkspaceSnapshot,
	providerID, serviceID string,
) (int, bool) {
	if workspace == nil {
		return 0, false
	}
	switch providerID {
	case "aws":
		switch serviceID {
		case "s3":
			return len(workspace.S3Buckets), true
		case "ec2":
			return len(workspace.EC2Instances), true
		case "lambda":
			return len(workspace.LambdaFunctions), true
		case "dynamodb":
			return len(workspace.DynamoDBTables), true
		case "sqs":
			return len(workspace.SQSQueues), true
		case "sns":
			return len(workspace.SNSTopics), true
		case "rds":
			return len(workspace.RDSInstances), true
		case "ecs":
			return len(workspace.ECSClusters), true
		case "eks":
			return len(workspace.EKSClusters), true
		case "cloudformation":
			return len(workspace.CloudFormationStacks), true
		case "eventbridge":
			return len(workspace.EventBridgeBuses), true
		case "route53":
			return len(workspace.Route53HostedZones), true
		case "elb":
			return len(workspace.ElbLoadBalancers), true
		case "kms":
			return len(workspace.KmsKeys), true
		case "apigateway":
			return len(workspace.ApiGatewayApis), true
		case "secrets":
			return len(workspace.SecretsManagerSecrets), true
		case "logs":
			return len(workspace.LogGroups), true
		case "iam":
			return len(workspace.IAMRoles) + len(workspace.IAMPolicies), true
		}
	case "azure":
		switch serviceID {
		case "azure-overview", "azure-resource-groups":
			return len(workspace.AzureResourceGroups), true
		case "azure-vms":
			return len(workspace.AzureVirtualMachines), true
		case "azure-storage":
			return len(workspace.AzureStorageAccounts), true
		case "azure-app-service":
			return len(workspace.AzureWebApps), true
		case "azure-functions":
			return len(workspace.AzureFunctionApps), true
		case "azure-key-vault":
			return len(workspace.AzureKeyVaults), true
		case "azure-cosmos":
			return len(workspace.AzureCosmosAccounts), true
		case "azure-postgres":
			return len(workspace.AzurePostgresServers), true
		case "azure-queues":
			return len(workspace.AzureStorageQueues), true
		case "azure-entra":
			return len(workspace.AzureEntraUsers), true
		case "azure-log-analytics":
			return len(workspace.AzureLogAnalyticsWorkspaces), true
		case "azure-waf":
			return len(workspace.AzureWafPolicies), true
		case "azure-front-door":
			return len(workspace.AzureFrontDoorProfiles), true
		}
	}
	return 0, false
}

