// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package labs

import (
	"context"

	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/labs"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/recipes"
)

// Discovery is the provider/profile discovery port used before verify/run.
type Discovery interface {
	Discover() (discovery.Snapshot, error)
}

// Deployments loads applied deployment records for lab sessions and recovery.
type Deployments interface {
	List(ctx context.Context) ([]deploy.Deployment, error)
	Get(ctx context.Context, id string) (*deploy.Deployment, error)
}

// Recipes loads recipe manifests so labs can read the lab section.
type Recipes interface {
	Load(id string) (recipes.Recipe, error)
}

// WriteInvoker executes a resolved invoke-write lab action.
// Matches internal/labs.WriteInvoker so the engine can call it directly.
type WriteInvoker = labs.WriteInvoker

// Runner is the lab session lifecycle engine port (internal/labs.Runner).
type Runner interface {
	Start(ctx context.Context, lab *recipes.LabSpec, deployment *deploy.Deployment) (labs.LabSession, error)
	Get(ctx context.Context, deploymentID string) (labs.LabSession, bool, error)
	VerifyStep(
		ctx context.Context,
		lab *recipes.LabSpec,
		deployment *deploy.Deployment,
		stepID string,
		profile models.ProfileSummary,
		region string,
		opts labs.VerifyOptions,
	) (labs.LabSession, error)
	RunAction(
		ctx context.Context,
		lab *recipes.LabSpec,
		deployment *deploy.Deployment,
		stepID string,
		actionIndex int,
		profile models.ProfileSummary,
		region string,
		invoke WriteInvoker,
	) (any, error)
	Reset(ctx context.Context, lab *recipes.LabSpec, deployment *deploy.Deployment) (labs.LabSession, error)
	RecoverActiveFault(ctx context.Context, deployment *deploy.Deployment) error
}
