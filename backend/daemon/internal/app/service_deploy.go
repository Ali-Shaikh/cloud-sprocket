// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"errors"

	appdeployment "cloudsprocket/backend/daemon/internal/app/deployment"
	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/recipes"
)

// Compatibility aliases for façade tests that still use the old names.
type tofuStatus = appdeployment.TofuStatus
type deploymentJob = appdeployment.DeploymentJob

// deploymentsList is a thin façade wrapper used by labs recovery.
func (s *Service) deploymentsList(ctx context.Context) ([]deploy.Deployment, error) {
	if s.deploy == nil {
		return nil, errors.New("deployment service not available")
	}
	return s.deploy.DeploymentsList(ctx)
}

func (s *Service) deploymentGet(ctx context.Context, id string) (*deploy.Deployment, error) {
	if s.deploy == nil {
		return nil, errors.New("deployment service not available")
	}
	return s.deploy.DeploymentGet(ctx, id)
}

func (s *Service) saveDeployment(ctx context.Context, deployment *deploy.Deployment, timestamp string) error {
	if s.deploy == nil {
		return errors.New("deployment service not available")
	}
	return s.deploy.SaveDeployment(ctx, deployment, timestamp)
}

// loadRecipe is a thin façade wrapper used by labs.
func (s *Service) loadRecipe(id string) (recipes.Recipe, error) {
	if s.deploy == nil {
		return recipes.Recipe{}, errors.New("deployment service not available")
	}
	return s.deploy.LoadRecipe(id)
}

func safeRecipePathSegment(value, field string) (string, error) {
	return appdeployment.SafeRecipePathSegment(value, field)
}

func (s *Service) setDeploymentStatus(ctx context.Context, deployment *deploy.Deployment, status deploy.Status, notifier Notifier) error {
	if s.deploy == nil {
		return errors.New("deployment service not available")
	}
	return s.deploy.SetDeploymentStatus(ctx, deployment, status, notifier)
}
