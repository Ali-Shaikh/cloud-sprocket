// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Package azure owns Azure-domain RPC handlers that no longer need the full
// app façade. Phase 5a covers inventory.get; Phase 5b covers selection groups;
// Phase 5c/5d cover sync write/mutation handlers (F-029).
package azure

import (
	"time"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
)

// Deps holds collaborators required to construct an Azure domain Service.
type Deps struct {
	Discovery       Discovery
	Session         sessionport.Session
	Workspace       sessionport.Workspace
	Activity        sessionport.Activity
	Invalidator     sessionport.Invalidator
	Gate            ServiceGate
	Catalog         ScopeCatalog
	ActionTimeout   time.Duration
	Storage         StorageWriter
	KeyVault        KeyVaultWriter
	Postgres        PostgresWriter
	Functions       FunctionsWriter
	WebApps         WebAppsWriter
	Waf             WafWriter
	ResourceGroups  ResourceGroupsWriter
	VirtualMachines VirtualMachinesWriter
	FrontDoor       FrontDoorWriter
	Queues          QueuesWriter
	Cosmos          CosmosWriter
}

// Service owns the extracted Azure inventory, selection, and write RPC paths.
type Service struct {
	discovery       Discovery
	session         sessionport.Session
	workspace       sessionport.Workspace
	activity        sessionport.Activity
	invalidator     sessionport.Invalidator
	gate            ServiceGate
	catalog         ScopeCatalog
	actionTimeout   time.Duration
	storage         StorageWriter
	keyVault        KeyVaultWriter
	postgres        PostgresWriter
	functions       FunctionsWriter
	webapps         WebAppsWriter
	waf             WafWriter
	resourceGroups  ResourceGroupsWriter
	virtualMachines VirtualMachinesWriter
	frontDoor       FrontDoorWriter
	queues          QueuesWriter
	cosmos          CosmosWriter
}

// New constructs an Azure domain Service.
func New(deps Deps) *Service {
	return &Service{
		discovery:       deps.Discovery,
		session:         deps.Session,
		workspace:       deps.Workspace,
		activity:        deps.Activity,
		invalidator:     deps.Invalidator,
		gate:            deps.Gate,
		catalog:         deps.Catalog,
		actionTimeout:   deps.ActionTimeout,
		storage:         deps.Storage,
		keyVault:        deps.KeyVault,
		postgres:        deps.Postgres,
		functions:       deps.Functions,
		webapps:         deps.WebApps,
		waf:             deps.Waf,
		resourceGroups:  deps.ResourceGroups,
		virtualMachines: deps.VirtualMachines,
		frontDoor:       deps.FrontDoor,
		queues:          deps.Queues,
		cosmos:          deps.Cosmos,
	}
}
