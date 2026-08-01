// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
)

// registerDeployHandlers registers recipes, tofu, and deployments methods.
func (s *Service) registerDeployHandlers(m *handlerRegistry) {
	m.register("recipes.list", func(_ context.Context, _ json.RawMessage, _ Notifier) (any, error) {
		if s.deploy == nil {
			return nil, errors.New("deployment service not available")
		}
		return s.deploy.RecipesList()
	})
	m.register("recipes.get", func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) {
		if s.deploy == nil {
			return nil, errors.New("deployment service not available")
		}
		return s.deploy.HandleRecipesGet(params)
	})
	m.register("recipes.import", func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) {
		if s.deploy == nil {
			return nil, errors.New("deployment service not available")
		}
		return s.deploy.HandleRecipesImport(params)
	})
	m.register("recipes.validate", func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) {
		if s.deploy == nil {
			return nil, errors.New("deployment service not available")
		}
		return s.deploy.HandleRecipesValidate(params)
	})
	m.register("recipes.scaffold", func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) {
		if s.deploy == nil {
			return nil, errors.New("deployment service not available")
		}
		return s.deploy.HandleRecipesScaffold(params)
	})
	m.register("tofu.status", func(ctx context.Context, _ json.RawMessage, _ Notifier) (any, error) {
		if s.deploy == nil {
			return nil, errors.New("deployment service not available")
		}
		return s.deploy.TofuStatus(ctx), nil
	})
	m.register("tofu.install", func(_ context.Context, _ json.RawMessage, notifier Notifier) (any, error) {
		if s.deploy == nil {
			return nil, errors.New("deployment service not available")
		}
		return s.deploy.HandleTofuInstall(notifier)
	})
	m.register("deployments.list", func(ctx context.Context, _ json.RawMessage, _ Notifier) (any, error) {
		if s.deploy == nil {
			return nil, errors.New("deployment service not available")
		}
		return s.deploy.DeploymentsList(ctx)
	})
	m.register("deployments.get", func(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
		if s.deploy == nil {
			return nil, errors.New("deployment service not available")
		}
		return s.deploy.HandleDeploymentsGet(ctx, params)
	})
	m.register("deployments.plan", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		if s.deploy == nil {
			return nil, errors.New("deployment service not available")
		}
		return s.deploy.HandleDeploymentsPlan(ctx, params, notifier)
	})
	m.register("deployments.apply", func(_ context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		if s.deploy == nil {
			return nil, errors.New("deployment service not available")
		}
		return s.deploy.HandleDeploymentsApply(params, notifier)
	})
	m.register("deployments.destroy", func(_ context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		if s.deploy == nil {
			return nil, errors.New("deployment service not available")
		}
		return s.deploy.HandleDeploymentsDestroy(params, notifier)
	})
	m.register("deployments.checkDrift", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		if s.deploy == nil {
			return nil, errors.New("deployment service not available")
		}
		return s.deploy.HandleDeploymentsCheckDrift(ctx, params, notifier)
	})
	m.register("deployments.cancel", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		if s.deploy == nil {
			return nil, errors.New("deployment service not available")
		}
		return s.deploy.HandleDeploymentsCancel(ctx, params, notifier)
	})
	m.register("deployments.delete", func(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
		if s.deploy == nil {
			return nil, errors.New("deployment service not available")
		}
		return s.deploy.HandleDeploymentsDelete(ctx, params)
	})
	m.register("deployments.retryPostApply", func(_ context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		if s.deploy == nil {
			return nil, errors.New("deployment service not available")
		}
		return s.deploy.HandleDeploymentsRetryPostApply(params, notifier)
	})
}
