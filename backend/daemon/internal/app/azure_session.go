// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"errors"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) withLockedAzureWorkspace(
	ctx context.Context,
	guardMsg string,
	mutate func(*models.SessionSnapshot) error,
) (discovery.Snapshot, models.SessionSnapshot, error) {
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return discovery.Snapshot{}, models.SessionSnapshot{}, err
	}
	// Session lock is held only inside sessionport.Session.Load/Update.
	if mutate == nil {
		session, loadErr := s.Load(ctx, snapshot)
		if loadErr != nil {
			return discovery.Snapshot{}, models.SessionSnapshot{}, loadErr
		}
		if !session.IsLocked || session.CurrentProviderID != "azure" {
			return discovery.Snapshot{}, models.SessionSnapshot{}, errors.New(guardMsg)
		}
		return snapshot, session, nil
	}
	session, err := s.Update(ctx, snapshot, func(sess *models.SessionSnapshot) error {
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

// finishAzureWorkspace rebuilds a lightweight full Azure inventory without AWS.
// Prefer finishAzureWorkspaceOpts with azureScope or azureResourceGroupSelection
// on single-service mutation paths so only the relevant enrichers run.
func (s *Service) finishAzureWorkspace(
	ctx context.Context,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	notifier Notifier,
	logLevel string,
	logMsg string,
) (models.WorkspaceSnapshot, error) {
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		lightweightAzure: true,
		skipAwsInventory: true,
	}, logLevel, logMsg)
}

func (s *Service) finishAzureWorkspaceOpts(
	ctx context.Context,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	notifier Notifier,
	opts workspaceSnapshotOptions,
	logLevel string,
	logMsg string,
) (models.WorkspaceSnapshot, error) {
	workspace := s.Build(ctx, snapshot, session, snapshotOptionsToPort(opts))
	if logMsg == "" {
		return workspace, nil
	}
	return workspace, s.NotifyStateAndLog(ctx, snapshot, session, notifier, logLevel, logMsg)
}

func (s *Service) azureProviderCommandPath(snapshot discovery.Snapshot) string {
	for _, provider := range snapshot.Providers {
		if provider.ProviderID == "azure" {
			return provider.CommandPath
		}
	}
	return ""
}
