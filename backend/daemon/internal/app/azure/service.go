// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Package azure owns Azure-domain RPC handlers that no longer need the full
// app façade. Phase 5a covers inventory.get. Selection groups and writes
// remain on the façade until later Phase 5 slices (F-029).
package azure

import (
	"cloudsprocket/backend/daemon/internal/app/sessionport"
)

// Deps holds collaborators required to construct an Azure domain Service.
type Deps struct {
	Discovery   Discovery
	Session     sessionport.Session
	Workspace   sessionport.Workspace
	Activity    sessionport.Activity
	Invalidator sessionport.Invalidator
	Gate        ServiceGate
	Catalog     ScopeCatalog
}

// Service owns the extracted Azure inventory RPC paths (and later selection
// and write groups).
type Service struct {
	discovery   Discovery
	session     sessionport.Session
	workspace   sessionport.Workspace
	activity    sessionport.Activity
	invalidator sessionport.Invalidator
	gate        ServiceGate
	catalog     ScopeCatalog
}

// New constructs an Azure domain Service.
func New(deps Deps) *Service {
	return &Service{
		discovery:   deps.Discovery,
		session:     deps.Session,
		workspace:   deps.Workspace,
		activity:    deps.Activity,
		invalidator: deps.Invalidator,
		gate:        deps.Gate,
		catalog:     deps.Catalog,
	}
}
