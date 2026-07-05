// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

type awsEnrichmentOptions struct {
	lightweight bool
	scope       string
	// serialEnrichment runs AWS enrichers sequentially. Test-only.
	serialEnrichment bool
}

func (s *Service) enrichAwsWorkspace(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil {
		return
	}

	if opts.scope != "" {
		s.enrichAwsScoped(workspace, session, opts)
		return
	}

	enrichers := make([]func(*sync.Mutex), 0, len(awsServiceCatalog()))
	for _, entry := range awsServiceCatalog() {
		if entry.InventoryScope == "" || !s.isServiceEnabled(entry.ProviderID, entry.ServiceID) {
			continue
		}
		scope := entry.InventoryScope
		enrichers = append(enrichers, func(mu *sync.Mutex) {
			s.runAwsInventoryEnricher(scope, workspace, session, opts, mu)
		})
	}

	var mu sync.Mutex
	if opts.serialEnrichment {
		for _, enrich := range enrichers {
			enrich(&mu)
		}
		return
	}

	var wg sync.WaitGroup
	for _, enrich := range enrichers {
		wg.Add(1)
		go func(fn func(*sync.Mutex)) {
			defer wg.Done()
			fn(&mu)
		}(enrich)
	}
	wg.Wait()
}

func (s *Service) enrichAwsScoped(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
) {
	serviceID := awsServiceIDForInventoryScope(opts.scope)
	if !s.isServiceEnabled("aws", serviceID) {
		return
	}
	scopeOpts := awsEnrichmentOptions{lightweight: opts.lightweight}
	s.runAwsInventoryEnricher(opts.scope, workspace, session, scopeOpts, nil)
}

func (s *Service) runAwsInventoryEnricher(
	scope string,
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
	mu *sync.Mutex,
) {
	switch scope {
	case "s3":
		s.enrichS3Inventory(workspace, session, opts, mu)
	case "ec2":
		s.enrichEC2Inventory(workspace, session, opts, mu)
	case "lambda":
		s.enrichLambdaInventory(workspace, session, opts, mu)
	case "dynamodb":
		s.enrichDynamoDBInventory(workspace, session, opts, mu)
	case "sqs":
		s.enrichSQSInventory(workspace, session, opts, mu)
	case "sns":
		s.enrichSNSInventory(workspace, session, opts, mu)
	case "rds":
		s.enrichRDSInventory(workspace, session, opts, mu)
	case "ecs":
		s.enrichECSInventory(workspace, session, opts, mu)
	case "eks":
		s.enrichEKSInventory(workspace, session, opts, mu)
	case "cloudformation":
		s.enrichCloudFormationInventory(workspace, session, opts, mu)
	case "eventbridge":
		s.enrichEventBridgeInventory(workspace, session, opts, mu)
	case "apigateway":
		s.enrichApiGatewayInventory(workspace, session, opts, mu)
	case "secrets":
		s.enrichSecretsManagerInventory(workspace, session, opts, mu)
	case "logs":
		s.enrichLogsInventory(workspace, session, opts, mu)
	case "iam":
		s.enrichIAMInventory(workspace, session, opts, mu)
	}
}