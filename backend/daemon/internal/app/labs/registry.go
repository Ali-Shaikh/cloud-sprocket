// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package labs

import (
	"context"
	"sync"
	"time"

	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/labs"
	"cloudsprocket/backend/daemon/internal/labs/checks"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/recipes"
)

// CheckDeps holds adapter functions for every verification check type.
// The façade supplies these; this package owns registry assembly (F-029 Phase 6b).
type CheckDeps struct {
	SQS        checks.SQSDeps
	HTTP       checks.HTTPDeps
	S3         checks.S3Deps
	Dynamo     checks.DynamoDeps
	Lambda     checks.LambdaDeps
	Logs       checks.LogsDeps
	Secrets    checks.SecretsDeps
	SNS        checks.SNSDeps
	AzureBlob  checks.AzureBlobDeps
	AzureQueue checks.AzureQueueDeps
}

// NewRegistry builds the production lab verification registry from adapter deps.
func NewRegistry(deps CheckDeps) *labs.Registry {
	return labs.NewRegistry(
		&checks.SQSQueueAttributeCheck{Deps: deps.SQS},
		&checks.HTTPGetCheck{Deps: deps.HTTP},
		&checks.HTTPUnreachableCheck{Deps: deps.HTTP},
		&checks.S3ObjectCheck{Deps: deps.S3},
		&checks.DynamoDBItemCheck{Deps: deps.Dynamo},
		&checks.LambdaInvokeCheck{Deps: deps.Lambda},
		&checks.LogsContainsCheck{Deps: deps.Logs},
		&checks.SecretsValueCheck{Deps: deps.Secrets},
		&checks.SNSSubscriptionCheck{Deps: deps.SNS},
		&checks.AzureBlobCheck{Deps: deps.AzureBlob},
		&checks.AzureQueueDepthCheck{Deps: deps.AzureQueue},
	)
}

// NewRunnerFromDeps builds a lab engine with the production check registry.
// Store persists lab sessions; now defaults to UTC when nil (via labs.NewRunner).
func NewRunnerFromDeps(store *labs.SessionStore, deps CheckDeps, now func() time.Time) *labs.Runner {
	return labs.NewRunner(store, NewRegistry(deps), now)
}

// LazyRunner builds the engine on first use so partial test façades that omit
// inventory adapters do not panic at service construction (method values on nil
// inventory interfaces are taken only when a lab RPC or recovery runs).
type LazyRunner struct {
	once   sync.Once
	build  func() *labs.Runner
	runner *labs.Runner
}

// NewLazyRunner defers engine construction until the first Runner method call.
func NewLazyRunner(build func() *labs.Runner) *LazyRunner {
	return &LazyRunner{build: build}
}

func (l *LazyRunner) engine() *labs.Runner {
	if l == nil {
		return nil
	}
	l.once.Do(func() {
		if l.build != nil {
			l.runner = l.build()
		}
	})
	return l.runner
}

// Start implements Runner.
func (l *LazyRunner) Start(ctx context.Context, lab *recipes.LabSpec, deployment *deploy.Deployment) (labs.LabSession, error) {
	return l.engine().Start(ctx, lab, deployment)
}

// Get implements Runner.
func (l *LazyRunner) Get(ctx context.Context, deploymentID string) (labs.LabSession, bool, error) {
	return l.engine().Get(ctx, deploymentID)
}

// VerifyStep implements Runner.
func (l *LazyRunner) VerifyStep(
	ctx context.Context,
	lab *recipes.LabSpec,
	deployment *deploy.Deployment,
	stepID string,
	profile models.ProfileSummary,
	region string,
	opts labs.VerifyOptions,
) (labs.LabSession, error) {
	return l.engine().VerifyStep(ctx, lab, deployment, stepID, profile, region, opts)
}

// RunAction implements Runner.
func (l *LazyRunner) RunAction(
	ctx context.Context,
	lab *recipes.LabSpec,
	deployment *deploy.Deployment,
	stepID string,
	actionIndex int,
	profile models.ProfileSummary,
	region string,
	invoke WriteInvoker,
) (any, error) {
	return l.engine().RunAction(ctx, lab, deployment, stepID, actionIndex, profile, region, invoke)
}

// Reset implements Runner.
func (l *LazyRunner) Reset(ctx context.Context, lab *recipes.LabSpec, deployment *deploy.Deployment) (labs.LabSession, error) {
	return l.engine().Reset(ctx, lab, deployment)
}

// RecoverActiveFault implements Runner.
func (l *LazyRunner) RecoverActiveFault(ctx context.Context, deployment *deploy.Deployment) error {
	return l.engine().RecoverActiveFault(ctx, deployment)
}

// Compile-time proof that engines satisfy the domain Runner port.
var (
	_ Runner = (*labs.Runner)(nil)
	_ Runner = (*LazyRunner)(nil)
)
