// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Package sessionport defines the narrow session, workspace, and cache
// invalidation capabilities that domain packages (AWS, Azure, labs) consume.
//
// The façade owns the single session/preferences lock and implements these
// ports. Domain packages must depend only on these interfaces (and models /
// discovery / rpcapi), never on internal/app. Do not pass the whole façade or
// unexported workspaceSnapshotOptions across package boundaries (F-029 Phase 3).
package sessionport

import (
	"context"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/rpcapi"
)

// Notifier is the shared progress/notification contract.
type Notifier = rpcapi.Notifier

// SnapshotOptions controls which inventory layers a workspace build loads.
// This is the exported replacement for the façade-local workspaceSnapshotOptions
// so domains can request scoped rebuilds without importing internal/app.
type SnapshotOptions struct {
	// LightweightAzure skips expensive Azure drill-down while selection
	// handlers load detail on demand.
	LightweightAzure bool
	// AzureResourceGroupSelection only refreshes resource groups, VMs, and App
	// Service inventory for the selected resource group.
	AzureResourceGroupSelection bool
	// SkipAwsInventory avoids reloading AWS inventories on Azure-only paths.
	SkipAwsInventory bool
	// AzureScope limits Azure enrichment to one service.
	AzureScope string
	// LightweightAWS skips expensive AWS drill-down on first paint.
	LightweightAWS bool
	// SkipAzureInventory avoids reloading Azure inventories on AWS-only paths.
	SkipAzureInventory bool
	// AWSScope limits AWS enrichment to one service.
	AWSScope string
	// AzureDeferredInventory loads only resource groups and VMs on workspace.get.
	AzureDeferredInventory bool
	// AWSDeferredInventory loads only S3 buckets and EC2 regions on workspace.get.
	AWSDeferredInventory bool
}

// Session is the locked session read/update port. Implementations must hold a
// single façade-owned mutex for the duration of Load/Update only, and must not
// hold that lock across provider inventory calls.
type Session interface {
	// Load reconciles stored session with discovery under the session lock and
	// returns a copy safe for the caller to read without further locking.
	Load(ctx context.Context, snapshot discovery.Snapshot) (models.SessionSnapshot, error)
	// Update loads, mutates, and persists the session under the session lock.
	// The mutate callback must not call provider inventory or other slow paths.
	Update(ctx context.Context, snapshot discovery.Snapshot, mutate func(*models.SessionSnapshot) error) (models.SessionSnapshot, error)
}

// Workspace builds WorkspaceSnapshot values for the current session. Builds may
// perform slow inventory probes and must not be called while holding the
// session lock.
type Workspace interface {
	Build(ctx context.Context, snapshot discovery.Snapshot, session models.SessionSnapshot, opts SnapshotOptions) models.WorkspaceSnapshot
}

// Invalidator is the explicit cross-domain cache invalidation port. Domains
// must call these methods instead of reaching into shared mutable cache fields.
type Invalidator interface {
	InvalidateRuntimeStatus()
	InvalidateAzureCLIExtensionCache()
	InvalidateCloudResourceCaches(ctx context.Context)
	InvalidateResourceCache(ctx context.Context, scope, queryHash string)
	InvalidateResourceCacheScope(ctx context.Context, scope string)
}

// Activity covers job and state notification helpers shared by domains.
type Activity interface {
	Timestamp() string
	NotifyStateAndLog(ctx context.Context, snapshot discovery.Snapshot, session models.SessionSnapshot, notifier Notifier, level, message string) error
	NotifyJob(notifier Notifier, job models.JobStatus)
	AppendActivity(ctx context.Context, notifier Notifier, level, message string) error
}

// Ports bundles the session-side capabilities a domain typically needs.
// Optional: domains may depend on individual interfaces instead.
type Ports struct {
	Session     Session
	Workspace   Workspace
	Invalidator Invalidator
	Activity    Activity
}
