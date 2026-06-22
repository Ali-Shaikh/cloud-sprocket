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

	enrichers := []func(*sync.Mutex){
		func(mu *sync.Mutex) { s.enrichS3Inventory(workspace, session, opts, mu) },
		func(mu *sync.Mutex) { s.enrichEC2Inventory(workspace, session, opts, mu) },
		func(mu *sync.Mutex) { s.enrichLambdaInventory(workspace, session, opts, mu) },
		func(mu *sync.Mutex) { s.enrichDynamoDBInventory(workspace, session, opts, mu) },
		func(mu *sync.Mutex) { s.enrichSQSInventory(workspace, session, opts, mu) },
		func(mu *sync.Mutex) { s.enrichSNSInventory(workspace, session, opts, mu) },
		func(mu *sync.Mutex) { s.enrichRDSInventory(workspace, session, opts, mu) },
		func(mu *sync.Mutex) { s.enrichLogsInventory(workspace, session, opts, mu) },
		func(mu *sync.Mutex) { s.enrichIAMInventory(workspace, session, opts, mu) },
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
	scopeOpts := awsEnrichmentOptions{lightweight: opts.lightweight}
	switch opts.scope {
	case "s3":
		s.enrichS3Inventory(workspace, session, scopeOpts, nil)
	case "ec2":
		s.enrichEC2Inventory(workspace, session, scopeOpts, nil)
	case "lambda":
		s.enrichLambdaInventory(workspace, session, scopeOpts, nil)
	case "dynamodb":
		s.enrichDynamoDBInventory(workspace, session, scopeOpts, nil)
	case "sqs":
		s.enrichSQSInventory(workspace, session, scopeOpts, nil)
	case "sns":
		s.enrichSNSInventory(workspace, session, scopeOpts, nil)
	case "rds":
		s.enrichRDSInventory(workspace, session, scopeOpts, nil)
	case "logs":
		s.enrichLogsInventory(workspace, session, scopeOpts, nil)
	case "iam":
		s.enrichIAMInventory(workspace, session, scopeOpts, nil)
	}
}