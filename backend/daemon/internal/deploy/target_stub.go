// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"context"

	"cloudsprocket/backend/daemon/internal/config"
)

// dockerComposeStubTarget is a no-op runtime used in tests to prove new targets
// register without editing the engine.
type dockerComposeStubTarget struct{}

func (t *dockerComposeStubTarget) ID() string { return "docker-compose" }

func (t *dockerComposeStubTarget) Label(_ *Deployment) string { return "Docker Compose" }

func (t *dockerComposeStubTarget) Env(_ *Deployment, _ config.Settings) []string { return nil }

func (t *dockerComposeStubTarget) Preflight(context.Context, *Deployment, config.Settings, TargetOptions) error {
	return nil
}

func (t *dockerComposeStubTarget) WriteOverrides(string, *Deployment, TargetOptions) error { return nil }