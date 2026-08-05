// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azure

import (
	"context"
	"errors"
	"time"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

// AuthorizeWrite verifies an Azure workspace is open with write mode enabled.
// The session lock is not held across the subsequent provider call.
func (s *Service) AuthorizeWrite(
	ctx context.Context,
	snapshot discovery.Snapshot,
	openMsg string,
	gateMsg string,
) (models.SessionSnapshot, models.ProfileSummary, error) {
	if s == nil || s.session == nil {
		return models.SessionSnapshot{}, models.ProfileSummary{}, errors.New("azure write service is not available")
	}
	session, err := s.session.Load(ctx, snapshot)
	if err != nil {
		return models.SessionSnapshot{}, models.ProfileSummary{}, err
	}
	profile, err := LockedAzureProfile(snapshot.Profiles, session, openMsg)
	if err != nil {
		return models.SessionSnapshot{}, models.ProfileSummary{}, err
	}
	if !WritesEnabled(session, profile, ProviderCommandPath(snapshot)) {
		return models.SessionSnapshot{}, models.ProfileSummary{}, errors.New(gateMsg)
	}
	return session, profile, nil
}

// FinishWriteAction reconciles the session after a successful write and returns
// a scoped workspace snapshot with a success notification.
func (s *Service) FinishWriteAction(
	ctx context.Context,
	snapshot discovery.Snapshot,
	notifier sessionport.Notifier,
	opts sessionport.SnapshotOptions,
	successMsg string,
	mutate func(*models.SessionSnapshot),
) (models.WorkspaceSnapshot, error) {
	if s == nil || s.session == nil || s.workspace == nil {
		return models.WorkspaceSnapshot{}, errors.New("azure write service is not available")
	}
	session, err := s.session.Update(ctx, snapshot, func(sess *models.SessionSnapshot) error {
		if mutate != nil {
			mutate(sess)
		}
		return nil
	})
	if err != nil {
		return models.WorkspaceSnapshot{}, err
	}
	return s.finishAzureSelection(ctx, snapshot, session, notifier, opts, "success", successMsg)
}

// WithActionTimeout bounds provider write/peek calls. A non-positive timeout is a no-op.
func (s *Service) WithActionTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	if s == nil || s.actionTimeout <= 0 {
		return ctx, func() {}
	}
	return context.WithTimeout(ctx, s.actionTimeout)
}

// ActionTimeout returns the configured write timeout (tests may assert).
func (s *Service) ActionTimeout() time.Duration {
	if s == nil {
		return 0
	}
	return s.actionTimeout
}
