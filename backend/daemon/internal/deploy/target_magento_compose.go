// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"context"

	"cloudsprocket/backend/daemon/internal/config"
)

// magentoComposeTarget validates Docker Compose is available for the local
// Magento stack recipe. Container startup is handled by the recipe postApply step.
type magentoComposeTarget struct {
	runner composeRunner
}

func newMagentoComposeTarget(_ config.Settings, _ TargetOptions) *magentoComposeTarget {
	return &magentoComposeTarget{runner: execComposeRunner{}}
}

func (t *magentoComposeTarget) ID() string { return "magento-compose" }

func (t *magentoComposeTarget) Label(_ *Deployment) string { return "Magento (Docker Compose)" }

func (t *magentoComposeTarget) Env(_ *Deployment, _ config.Settings) []string { return nil }

func (t *magentoComposeTarget) Preflight(ctx context.Context, deployment *Deployment, _ config.Settings, _ TargetOptions) error {
	if err := t.runner.ComposeVersion(ctx); err != nil {
		return err
	}
	if deployment == nil {
		return nil
	}
	profile := magentoStringVar(deployment.Variables, "stack_profile", "simple")
	if profile == "official" {
		publicKey := magentoStringVar(deployment.Variables, "magento_public_key", "")
		privateKey := magentoStringVar(deployment.Variables, "magento_private_key", "")
		if publicKey == "" || privateKey == "" {
			// Install step fails with a clear message; preflight stays non-blocking so keys can be added later.
			return nil
		}
	}
	return nil
}

func (t *magentoComposeTarget) WriteOverrides(_ string, _ *Deployment, _ TargetOptions) error {
	return nil
}