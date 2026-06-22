// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"errors"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) withLockedAWSWorkspace(
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
	if !session.IsLocked || session.CurrentProviderID != "aws" {
		return discovery.Snapshot{}, models.SessionSnapshot{}, errors.New(guardMsg)
	}
	if err := mutate(&session); err != nil {
		return discovery.Snapshot{}, models.SessionSnapshot{}, err
	}
	if err := s.store.SaveSession(ctx, session); err != nil {
		return discovery.Snapshot{}, models.SessionSnapshot{}, err
	}
	return snapshot, session, nil
}

func (s *Service) finishAWSWorkspace(
	ctx context.Context,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	notifier Notifier,
	logLevel string,
	logMsg string,
	logOnly bool,
) (models.WorkspaceSnapshot, error) {
	return s.finishAWSWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{}, logLevel, logMsg, logOnly)
}

func (s *Service) finishAWSWorkspaceOpts(
	ctx context.Context,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	notifier Notifier,
	opts workspaceSnapshotOptions,
	logLevel string,
	logMsg string,
	logOnly bool,
) (models.WorkspaceSnapshot, error) {
	workspace := s.buildWorkspaceSnapshotOpts(snapshot, session, opts)
	if logMsg == "" {
		return workspace, nil
	}
	if logOnly {
		if notifier != nil {
			_ = notifier.Notify("log.appended", models.ActivityLogEntry{
				Level:     logLevel,
				Message:   logMsg,
				Timestamp: s.timestamp(),
			})
		}
		return workspace, nil
	}
	return workspace, s.notifyStateAndLog(ctx, snapshot, session, notifier, logLevel, logMsg)
}
