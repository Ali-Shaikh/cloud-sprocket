// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deployment

import (
	"context"

	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/recipes"
	"cloudsprocket/backend/daemon/internal/rpcapi"
	"cloudsprocket/backend/daemon/internal/store"
	"cloudsprocket/backend/daemon/internal/tofu"
)

// Notifier is the shared progress/notification contract.
type Notifier = rpcapi.Notifier

// Deployer runs recipe deployments through the IaC engine.
type Deployer interface {
	Available() bool
	Version(ctx context.Context) (string, error)
	BinaryPath() string
	Install(ctx context.Context) (string, error)
	Preflight(ctx context.Context, deployment *deploy.Deployment) error
	TargetLabel(deployment *deploy.Deployment) string
	Prepare(deployment *deploy.Deployment) error
	Plan(ctx context.Context, deployment *deploy.Deployment, onLine tofu.LogFunc) (deploy.PlanSummary, error)
	Apply(ctx context.Context, deployment *deploy.Deployment, onLine tofu.LogFunc) (deploy.ApplyResult, error)
	RetryPostApply(ctx context.Context, deployment *deploy.Deployment, onLine tofu.LogFunc) error
	Destroy(ctx context.Context, deployment *deploy.Deployment, onLine tofu.LogFunc) error
	CheckDrift(ctx context.Context, deployment *deploy.Deployment, onLine tofu.LogFunc) (deploy.DriftReport, error)
	RemoveWorkspace(id string) error
	ReleaseWorkspace(id string)
}

// Store is the persistence port for deployment records and related activity.
type Store interface {
	ListDeployments(ctx context.Context) ([]store.DeploymentRow, error)
	LoadDeploymentRaw(ctx context.Context, id string) (payload string, updatedAt string, ok bool, err error)
	DeleteDeployment(ctx context.Context, id string) error
	SaveDeployment(ctx context.Context, id string, value any, timestamp string) error
	SaveDeploymentWithLog(
		ctx context.Context,
		id string,
		value any,
		deploymentTimestamp string,
		level string,
		message string,
		details string,
		logTimestamp string,
	) (models.ActivityLogEntry, error)
}

// Secrets seals and opens sensitive deployment fields at rest. Implemented by
// the façade so secret-key ownership stays outside the deployment domain.
type Secrets interface {
	SealForStore(deployment *deploy.Deployment) (*deploy.Deployment, error)
	OpenFromStore(ctx context.Context, deployment *deploy.Deployment, storedPayloadJSON, storedUpdatedAt string) error
}

// Recipes is the recipe catalogue used by plan/import handlers.
type Recipes interface {
	List() ([]recipes.Manifest, error)
	Load(id string) (recipes.Recipe, error)
}
