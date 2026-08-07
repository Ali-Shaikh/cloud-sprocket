// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	applabs "cloudsprocket/backend/daemon/internal/app/labs"
	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/labs"
	"cloudsprocket/backend/daemon/internal/labs/checks"
	"cloudsprocket/backend/daemon/internal/recipes"
)

// Thin façade wrappers for labs.* RPCs owned by internal/app/labs (F-029 Phase 6).
// Check-registry assembly and invoke-write dispatch live in app/labs; the façade
// supplies inventory adapters and action timeout only.

// newLabRunner returns a lazy production engine. Adapter method values are
// taken on first use so partial test façades without full inventory stubs stay
// constructible (same behaviour as the former labRunnerOnce path).
func (s *Service) newLabRunner() applabs.Runner {
	return applabs.NewLazyRunner(func() *labs.Runner {
		return applabs.NewRunnerFromDeps(
			labs.NewSessionStore(s.store),
			applabs.CheckDeps{
				SQS:        checks.SQSDeps{DescribeQueue: s.sqs.DescribeQueue},
				HTTP:       checks.HTTPDeps{Get: s.labsHTTPGet},
				S3:         checks.S3Deps{HeadObject: s.s3.HeadObject, GetObject: s.s3.GetObject},
				Dynamo:     checks.DynamoDeps{GetItem: s.dynamodb.GetItem},
				Lambda:     checks.LambdaDeps{Invoke: s.lambda.InvokeFunction},
				Logs:       checks.LogsDeps{DescribeLogGroup: s.logs.DescribeLogGroup},
				Secrets:    checks.SecretsDeps{GetSecretValue: s.secretsManager.GetSecretValue},
				SNS:        checks.SNSDeps{DescribeTopic: s.sns.DescribeTopic},
				AzureBlob:  checks.AzureBlobDeps{ListBlobs: s.azure.ListBlobs},
				AzureQueue: checks.AzureQueueDeps{ApproximateCount: s.azure.GetQueueApproximateMessageCount},
			},
			func() time.Time { return s.now() },
		)
	})
}

func (s *Service) recoverLabFaults(ctx context.Context) error {
	if s.labsDomain == nil {
		return nil
	}
	return s.labsDomain.RecoverActiveFaults(ctx)
}

func (s *Service) labsHTTPGet(ctx context.Context, targetURL string) (int, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return 0, err
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return 0, err
	}
	applabs.DrainAndCloseHTTPBody(response.Body)
	return response.StatusCode, nil
}

func (s *Service) handleLabsStart(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if s.labsDomain == nil {
		return nil, errors.New("labs service not available")
	}
	return s.labsDomain.HandleStart(ctx, params, notifier)
}

func (s *Service) handleLabsGet(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if s.labsDomain == nil {
		return nil, errors.New("labs service not available")
	}
	return s.labsDomain.HandleGet(ctx, params, notifier)
}

func (s *Service) handleLabsVerifyStep(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if s.labsDomain == nil {
		return nil, errors.New("labs service not available")
	}
	return s.labsDomain.HandleVerifyStep(ctx, params, notifier)
}

func (s *Service) handleLabsRunAction(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if s.labsDomain == nil {
		return nil, errors.New("labs service not available")
	}
	return s.labsDomain.HandleRunAction(ctx, params, notifier)
}

func (s *Service) handleLabsReset(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if s.labsDomain == nil {
		return nil, errors.New("labs service not available")
	}
	return s.labsDomain.HandleReset(ctx, params, notifier)
}

// labsDeploymentsAdapter exposes deployment list/get to the labs domain without
// importing the full deployment package into handler code paths.
type labsDeploymentsAdapter struct {
	s *Service
}

func (a labsDeploymentsAdapter) List(ctx context.Context) ([]deploy.Deployment, error) {
	return a.s.deploymentsList(ctx)
}

func (a labsDeploymentsAdapter) Get(ctx context.Context, id string) (*deploy.Deployment, error) {
	return a.s.deploymentGet(ctx, id)
}

// labsRecipesAdapter loads recipes through the deployment domain façade helpers.
type labsRecipesAdapter struct {
	s *Service
}

func (a labsRecipesAdapter) Load(id string) (recipes.Recipe, error) {
	return a.s.loadRecipe(id)
}

// Compile-time proof that façade adapters satisfy labs domain ports.
// The engine (*labs.Runner) is proven against applabs.Runner in app/labs.
var (
	_ applabs.Deployments = labsDeploymentsAdapter{}
	_ applabs.Recipes     = labsRecipesAdapter{}
)
