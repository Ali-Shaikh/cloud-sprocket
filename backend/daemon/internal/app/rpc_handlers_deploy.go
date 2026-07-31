// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
)

// registerDeployHandlers registers recipes, tofu, and deployments methods.
func (s *Service) registerDeployHandlers(m *handlerRegistry) {
	m.register("recipes.list", func(_ context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.recipes.List() })
	m.register("recipes.get", func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) {
		return s.handleRecipesGet(params)
	})
	m.register("recipes.import", func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) {
		return s.handleRecipesImport(params)
	})
	m.register("recipes.validate", func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) {
		return s.handleRecipesValidate(params)
	})
	m.register("recipes.scaffold", func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) {
		return s.handleRecipesScaffold(params)
	})
	m.register("tofu.status", func(ctx context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.tofuStatus(ctx), nil })
	m.register("tofu.install", func(_ context.Context, _ json.RawMessage, notifier Notifier) (any, error) {
		return s.handleTofuInstall(notifier)
	})
	m.register("deployments.list", func(ctx context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.deploymentsList(ctx) })
	m.register("deployments.get", func(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
		return s.handleDeploymentsGet(ctx, params)
	})
	m.register("deployments.plan", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleDeploymentsPlan(ctx, params, notifier)
	})
	m.register("deployments.apply", func(_ context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleDeploymentsApply(params, notifier)
	})
	m.register("deployments.destroy", func(_ context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleDeploymentsDestroy(params, notifier)
	})
	m.register("deployments.checkDrift", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleDeploymentsCheckDrift(ctx, params, notifier)
	})
	m.register("deployments.cancel", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleDeploymentsCancel(ctx, params, notifier)
	})
	m.register("deployments.delete", func(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
		return s.handleDeploymentsDelete(ctx, params)
	})
	m.register("deployments.retryPostApply", func(_ context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleDeploymentsRetryPostApply(params, notifier)
	})
}
