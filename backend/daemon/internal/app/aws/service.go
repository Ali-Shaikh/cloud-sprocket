// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Package aws owns AWS-domain RPC handlers that no longer need the full app
// façade. Phase 4 starts with aws.inventory.get; selection and write groups
// move in later slices (F-029).
package aws

import (
	"cloudsprocket/backend/daemon/internal/app/sessionport"
)

// Deps holds collaborators required to construct an AWS domain Service.
type Deps struct {
	Discovery Discovery
	Session   sessionport.Session
	Workspace sessionport.Workspace
	Gate      ServiceGate
	Catalog   ScopeCatalog
}

// Service owns the extracted AWS inventory RPC path.
type Service struct {
	discovery Discovery
	session   sessionport.Session
	workspace sessionport.Workspace
	gate      ServiceGate
	catalog   ScopeCatalog
}

// New constructs an AWS domain Service.
func New(deps Deps) *Service {
	return &Service{
		discovery: deps.Discovery,
		session:   deps.Session,
		workspace: deps.Workspace,
		gate:      deps.Gate,
		catalog:   deps.Catalog,
	}
}
