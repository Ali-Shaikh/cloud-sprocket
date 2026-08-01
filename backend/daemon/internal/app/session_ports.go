// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

// Compile-time proof that the façade implements the F-029 Phase 3 ports.
var (
	_ sessionport.Session     = (*Service)(nil)
	_ sessionport.Workspace   = (*Service)(nil)
	_ sessionport.Invalidator = (*Service)(nil)
	_ sessionport.Activity    = (*Service)(nil)
)

// SessionPorts returns the bundled session/workspace/invalidation ports for
// domain packages that prefer a single dependency.
func (s *Service) SessionPorts() sessionport.Ports {
	return sessionport.Ports{
		Session:     s,
		Workspace:   s,
		Invalidator: s,
		Activity:    s,
	}
}

// Load implements sessionport.Session. The session lock is held only for the
// store reconcile/save, not for any provider inventory work.
func (s *Service) Load(ctx context.Context, snapshot discovery.Snapshot) (models.SessionSnapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.currentState(ctx, snapshot)
}

// Update implements sessionport.Session. mutate runs under the session lock and
// must stay free of slow provider calls.
func (s *Service) Update(ctx context.Context, snapshot discovery.Snapshot, mutate func(*models.SessionSnapshot) error) (models.SessionSnapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		return models.SessionSnapshot{}, err
	}
	if mutate != nil {
		if err := mutate(&session); err != nil {
			return models.SessionSnapshot{}, err
		}
	}
	if err := s.store.SaveSession(ctx, session); err != nil {
		return models.SessionSnapshot{}, err
	}
	return session, nil
}

// Build implements sessionport.Workspace.
func (s *Service) Build(ctx context.Context, snapshot discovery.Snapshot, session models.SessionSnapshot, opts sessionport.SnapshotOptions) models.WorkspaceSnapshot {
	return s.buildWorkspaceSnapshotOpts(ctx, snapshot, session, snapshotOptionsFromPort(opts))
}

// InvalidateRuntimeStatus implements sessionport.Invalidator.
func (s *Service) InvalidateRuntimeStatus() {
	s.invalidateRuntimeStatus()
}

// InvalidateAzureCLIExtensionCache implements sessionport.Invalidator.
func (s *Service) InvalidateAzureCLIExtensionCache() {
	s.invalidateAzureCLIExtensionCache()
}

// InvalidateCloudResourceCaches implements sessionport.Invalidator.
func (s *Service) InvalidateCloudResourceCaches(ctx context.Context) {
	s.invalidateCloudResourceCaches(ctx)
}

// InvalidateResourceCache implements sessionport.Invalidator.
func (s *Service) InvalidateResourceCache(ctx context.Context, scope, queryHash string) {
	s.invalidateResourceCache(ctx, scope, queryHash)
}

// InvalidateResourceCacheScope implements sessionport.Invalidator.
func (s *Service) InvalidateResourceCacheScope(ctx context.Context, scope string) {
	s.invalidateResourceCacheScope(ctx, scope)
}

// Timestamp implements sessionport.Activity.
func (s *Service) Timestamp() string {
	return s.timestamp()
}

// NotifyStateAndLog implements sessionport.Activity.
func (s *Service) NotifyStateAndLog(ctx context.Context, snapshot discovery.Snapshot, session models.SessionSnapshot, notifier sessionport.Notifier, level, message string) error {
	return s.notifyStateAndLog(ctx, snapshot, session, notifier, level, message)
}

// NotifyJob implements sessionport.Activity.
func (s *Service) NotifyJob(notifier sessionport.Notifier, job models.JobStatus) {
	s.notifyJob(notifier, job)
}

// AppendActivity implements sessionport.Activity.
func (s *Service) AppendActivity(ctx context.Context, notifier sessionport.Notifier, level, message string) error {
	return s.appendActivity(ctx, notifier, level, message)
}

// snapshotOptionsFromPort maps the public domain options into the façade-local
// enrichment flags. Kept unexported so domains cannot reach the internal type.
func snapshotOptionsFromPort(opts sessionport.SnapshotOptions) workspaceSnapshotOptions {
	return workspaceSnapshotOptions{
		lightweightAzure:            opts.LightweightAzure,
		azureResourceGroupSelection: opts.AzureResourceGroupSelection,
		skipAwsInventory:            opts.SkipAwsInventory,
		azureScope:                  opts.AzureScope,
		lightweightAWS:              opts.LightweightAWS,
		skipAzureInventory:          opts.SkipAzureInventory,
		awsScope:                    opts.AWSScope,
		azureDeferredInventory:      opts.AzureDeferredInventory,
		awsDeferredInventory:        opts.AWSDeferredInventory,
	}
}

// snapshotOptionsToPort is used by façade helpers that already hold internal
// options and need to call Build or finish paths through the public shape.
func snapshotOptionsToPort(opts workspaceSnapshotOptions) sessionport.SnapshotOptions {
	return sessionport.SnapshotOptions{
		LightweightAzure:            opts.lightweightAzure,
		AzureResourceGroupSelection: opts.azureResourceGroupSelection,
		SkipAwsInventory:            opts.skipAwsInventory,
		AzureScope:                  opts.azureScope,
		LightweightAWS:              opts.lightweightAWS,
		SkipAzureInventory:          opts.skipAzureInventory,
		AWSScope:                    opts.awsScope,
		AzureDeferredInventory:      opts.azureDeferredInventory,
		AWSDeferredInventory:        opts.awsDeferredInventory,
	}
}
