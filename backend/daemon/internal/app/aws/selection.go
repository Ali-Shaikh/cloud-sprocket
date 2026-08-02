// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package aws

import (
	"context"
	"errors"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

// withLockedAWSWorkspace discovers profiles, verifies an AWS workspace is open,
// mutates the session under the façade session lock, and returns the updated
// session. mutate must stay free of slow provider inventory calls.
func (s *Service) withLockedAWSWorkspace(
	ctx context.Context,
	guardMsg string,
	mutate func(*models.SessionSnapshot) error,
) (discovery.Snapshot, models.SessionSnapshot, error) {
	if s == nil || s.discovery == nil || s.session == nil {
		return discovery.Snapshot{}, models.SessionSnapshot{}, errors.New("aws selection service is not available")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return discovery.Snapshot{}, models.SessionSnapshot{}, err
	}
	session, err := s.session.Update(ctx, snapshot, func(sess *models.SessionSnapshot) error {
		if !sess.IsLocked || sess.CurrentProviderID != "aws" {
			return errors.New(guardMsg)
		}
		if mutate != nil {
			return mutate(sess)
		}
		return nil
	})
	if err != nil {
		return discovery.Snapshot{}, models.SessionSnapshot{}, err
	}
	return snapshot, session, nil
}

// finishAWSSelection rebuilds a scoped AWS workspace snapshot after a
// selection mutation. Empty scope skips AWSScope so the enricher runs the
// default path (used by EC2, which replaces the workspace wholesale on the
// client). logOnly emits an activity log without a full state notification.
func (s *Service) finishAWSSelection(
	ctx context.Context,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	notifier sessionport.Notifier,
	scope string,
	logLevel string,
	logMsg string,
	logOnly bool,
) (models.WorkspaceSnapshot, error) {
	if s == nil || s.workspace == nil {
		return models.WorkspaceSnapshot{}, errors.New("aws selection service is not available")
	}
	opts := sessionport.SnapshotOptions{
		SkipAzureInventory: true,
		AWSScope:           scope,
	}
	workspace := s.workspace.Build(ctx, snapshot, session, opts)
	if logMsg == "" {
		return workspace, nil
	}
	if logOnly {
		if notifier != nil && s.activity != nil {
			_ = notifier.Notify("log.appended", models.ActivityLogEntry{
				Level:     logLevel,
				Message:   logMsg,
				Timestamp: s.activity.Timestamp(),
			})
		}
		return workspace, nil
	}
	if s.activity == nil {
		return workspace, nil
	}
	return workspace, s.activity.NotifyStateAndLog(ctx, snapshot, session, notifier, logLevel, logMsg)
}
