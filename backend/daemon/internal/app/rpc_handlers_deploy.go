// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
)

// registerDeployHandlers registers recipes, tofu, and deployments methods.
func (s *Service) registerDeployHandlers(m map[string]RPCHandler) {
	m["recipes.list"] = func(_ context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.recipes.List() }
	m["recipes.get"] = func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleRecipesGet(params) }
	m["recipes.import"] = func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleRecipesImport(params) }
	m["recipes.validate"] = func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleRecipesValidate(params) }
	m["recipes.scaffold"] = func(_ context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleRecipesScaffold(params) }
	m["tofu.status"] = func(ctx context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.tofuStatus(ctx), nil }
	m["tofu.install"] = func(_ context.Context, _ json.RawMessage, notifier Notifier) (any, error) { return s.handleTofuInstall(notifier) }
	m["deployments.list"] = func(ctx context.Context, _ json.RawMessage, _ Notifier) (any, error) { return s.deploymentsList(ctx) }
	m["deployments.get"] = func(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleDeploymentsGet(ctx, params) }
	m["deployments.plan"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleDeploymentsPlan(ctx, params, notifier) }
	m["deployments.apply"] = func(_ context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleDeploymentsApply(params, notifier) }
	m["deployments.destroy"] = func(_ context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleDeploymentsDestroy(params, notifier) }
	m["deployments.checkDrift"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleDeploymentsCheckDrift(ctx, params, notifier) }
	m["deployments.cancel"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleDeploymentsCancel(ctx, params, notifier) }
	m["deployments.delete"] = func(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) { return s.handleDeploymentsDelete(ctx, params) }
	m["deployments.retryPostApply"] = func(_ context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleDeploymentsRetryPostApply(params, notifier) }
}
