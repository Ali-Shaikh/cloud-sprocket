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
	s.mu.Lock()
	defer s.mu.Unlock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		return discovery.Snapshot{}, models.SessionSnapshot{}, err
	}
	if !session.IsLocked || session.CurrentProviderID != "azure" {
		return discovery.Snapshot{}, models.SessionSnapshot{}, errors.New(guardMsg)
	}
	if mutate != nil {
		if err := mutate(&session); err != nil {
			return discovery.Snapshot{}, models.SessionSnapshot{}, err
		}
		if err := s.store.SaveSession(ctx, session); err != nil {
			return discovery.Snapshot{}, models.SessionSnapshot{}, err
		}
	}
	return snapshot, session, nil
}

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
	workspace := s.buildWorkspaceSnapshotOpts(snapshot, session, opts)
	if logMsg == "" {
		return workspace, nil
	}
	return workspace, s.notifyStateAndLog(ctx, snapshot, session, notifier, logLevel, logMsg)
}

func (s *Service) azureProviderCommandPath(snapshot discovery.Snapshot) string {
	for _, provider := range snapshot.Providers {
		if provider.ProviderID == "azure" {
			return provider.CommandPath
		}
	}
	return ""
}