// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"context"
	"time"
)

// preflightTimeout bounds the reachability probe so a dead target fails fast
// with a clear message instead of stalling behind tofu's own minutes-long
// retry loop (the "Still creating..." spin a user sees against a down emulator).
const preflightTimeout = 3 * time.Second

// Preflight verifies the deployment target is reachable (local emulator) or
// configured (cloud profile) before any tofu command runs. It exists because
// tofu, pointed at an unreachable endpoint, retries silently for a long time;
// catching it here turns that into an immediate, actionable error.
func (e *Engine) Preflight(ctx context.Context, deployment *Deployment) error {
	switch deployment.ProviderID {
	case "aws", "azure":
	default:
		return nil
	}
	if err := e.checkRecipeTargetCompat(deployment); err != nil {
		return err
	}
	target, err := e.registry.Resolve(deployment)
	if err != nil {
		return err
	}
	return target.Preflight(ctx, deployment, e.settings, e.registry.opts)
}