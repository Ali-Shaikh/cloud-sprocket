// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azure

import (
	"context"
	"errors"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

// withLockedAzureWorkspace discovers profiles, verifies an Azure workspace is
// open, mutates the session under the façade session lock, and returns the
// updated session. mutate must stay free of slow provider inventory calls.
// When mutate is nil the session is only loaded and guarded (no persist).
func (s *Service) withLockedAzureWorkspace(
	ctx context.Context,
	guardMsg string,
	mutate func(*models.SessionSnapshot) error,
) (discovery.Snapshot, models.SessionSnapshot, error) {
	if s == nil || s.discovery == nil || s.session == nil {
		return discovery.Snapshot{}, models.SessionSnapshot{}, errors.New("azure selection service is not available")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return discovery.Snapshot{}, models.SessionSnapshot{}, err
	}
	// Session lock is held only inside sessionport.Session.Load/Update.
	if mutate == nil {
		session, loadErr := s.session.Load(ctx, snapshot)
		if loadErr != nil {
			return discovery.Snapshot{}, models.SessionSnapshot{}, loadErr
		}
		if !session.IsLocked || session.CurrentProviderID != "azure" {
			return discovery.Snapshot{}, models.SessionSnapshot{}, errors.New(guardMsg)
		}
		return snapshot, session, nil
	}
	session, err := s.session.Update(ctx, snapshot, func(sess *models.SessionSnapshot) error {
		if !sess.IsLocked || sess.CurrentProviderID != "azure" {
			return errors.New(guardMsg)
		}
		return mutate(sess)
	})
	if err != nil {
		return discovery.Snapshot{}, models.SessionSnapshot{}, err
	}
	return snapshot, session, nil
}

// finishAzureSelection rebuilds a scoped Azure workspace snapshot after a
// selection mutation. Callers pass AzureScope and/or AzureResourceGroupSelection
// via opts; SkipAwsInventory is forced true. Empty logMsg skips activity notify.
func (s *Service) finishAzureSelection(
	ctx context.Context,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	notifier sessionport.Notifier,
	opts sessionport.SnapshotOptions,
	logLevel string,
	logMsg string,
) (models.WorkspaceSnapshot, error) {
	if s == nil || s.workspace == nil {
		return models.WorkspaceSnapshot{}, errors.New("azure selection service is not available")
	}
	opts.SkipAwsInventory = true
	workspace := s.workspace.Build(ctx, snapshot, session, opts)
	if logMsg == "" {
		return workspace, nil
	}
	if s.activity == nil {
		return workspace, nil
	}
	return workspace, s.activity.NotifyStateAndLog(ctx, snapshot, session, notifier, logLevel, logMsg)
}
