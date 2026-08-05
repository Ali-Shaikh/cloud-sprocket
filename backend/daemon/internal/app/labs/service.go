// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Package labs owns labs.* JSON-RPC handlers and startup fault recovery.
// Phase 6a covers start/get/verifyStep/runAction/reset plus recovery.
// AWS invoke-write ops stay on the façade behind the WriteExecutor port (F-029).
package labs

import (
	"cloudsprocket/backend/daemon/internal/app/sessionport"
)

// Deps holds collaborators required to construct a labs domain Service.
type Deps struct {
	Discovery   Discovery
	Session     sessionport.Session
	Invalidator sessionport.Invalidator
	Deployments Deployments
	Recipes     Recipes
	Runner      Runner
	Writes      WriteExecutor
}

// Service owns the extracted labs RPC paths and startup fault recovery.
type Service struct {
	discovery   Discovery
	session     sessionport.Session
	invalidator sessionport.Invalidator
	deployments Deployments
	recipes     Recipes
	runner      Runner
	writes      WriteExecutor
}

// New constructs a labs domain Service.
func New(deps Deps) *Service {
	return &Service{
		discovery:   deps.Discovery,
		session:     deps.Session,
		invalidator: deps.Invalidator,
		deployments: deps.Deployments,
		recipes:     deps.Recipes,
		runner:      deps.Runner,
		writes:      deps.Writes,
	}
}
