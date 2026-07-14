// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package labs

import (
	"context"
	"fmt"

	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/recipes"
)

// CheckContext carries deployment-scoped data for a verification check.
type CheckContext struct {
	Deployment *deploy.Deployment
	Profile    models.ProfileSummary
	Region     string
	// AWSWritesEnabled mirrors the workspace write gate (locked + write mode).
	// Side-effecting verifies (lambda.invoke) and sensitive reveals
	// (secrets.value) must refuse to run when this is false.
	AWSWritesEnabled bool
}

// Check evaluates one lab verification spec.
type Check interface {
	Type() string
	Run(ctx context.Context, verify recipes.LabVerify, checkCtx CheckContext) (VerifyResult, error)
}

// Registry maps verification type names to implementations.
type Registry struct {
	checks map[string]Check
}

// NewRegistry builds a registry from the supplied checks.
func NewRegistry(checks ...Check) *Registry {
	registry := &Registry{checks: map[string]Check{}}
	for _, check := range checks {
		if check == nil {
			continue
		}
		registry.checks[check.Type()] = check
	}
	return registry
}

// Run executes a verification spec when a check is registered.
func (r *Registry) Run(ctx context.Context, verify recipes.LabVerify, checkCtx CheckContext) (VerifyResult, error) {
	if r == nil {
		return VerifyResult{}, fmt.Errorf("verification registry is not configured")
	}
	check, ok := r.checks[verify.Type]
	if !ok {
		return VerifyResult{
			Type:    verify.Type,
			Passed:  false,
			Message: fmt.Sprintf("verification type %q is not available", verify.Type),
		}, nil
	}
	return check.Run(ctx, verify, checkCtx)
}