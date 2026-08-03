// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package aws

import (
	"context"
	"errors"
	"time"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

// WriteSelection resolves profile, region, and target resource id for a write
// or peek action from the current session and request.
type WriteSelection func(discovery.Snapshot, models.SessionSnapshot) (models.ProfileSummary, string, string, error)

// AuthorizeWriteSelection loads the session, resolves the action target via
// selection, and enforces the write gate. The session lock is not held across
// the subsequent provider call.
func (s *Service) AuthorizeWriteSelection(
	ctx context.Context,
	snapshot discovery.Snapshot,
	gateMsg string,
	selection WriteSelection,
) (models.ProfileSummary, string, string, error) {
	if s == nil || s.session == nil {
		return models.ProfileSummary{}, "", "", errors.New("aws write service is not available")
	}
	session, err := s.session.Load(ctx, snapshot)
	if err != nil {
		return models.ProfileSummary{}, "", "", err
	}
	profile, region, resourceID, err := selection(snapshot, session)
	if err != nil {
		return models.ProfileSummary{}, "", "", err
	}
	if !WritesEnabled(session, profile) {
		return models.ProfileSummary{}, "", "", errors.New(gateMsg)
	}
	return profile, region, resourceID, nil
}

// AuthorizeWrite verifies an AWS workspace is open with write mode enabled.
func (s *Service) AuthorizeWrite(
	ctx context.Context,
	snapshot discovery.Snapshot,
	openMsg string,
	gateMsg string,
) (models.SessionSnapshot, models.ProfileSummary, error) {
	if s == nil || s.session == nil {
		return models.SessionSnapshot{}, models.ProfileSummary{}, errors.New("aws write service is not available")
	}
	session, err := s.session.Load(ctx, snapshot)
	if err != nil {
		return models.SessionSnapshot{}, models.ProfileSummary{}, err
	}
	profile, err := LockedAWSProfile(snapshot.Profiles, session, openMsg)
	if err != nil {
		return models.SessionSnapshot{}, models.ProfileSummary{}, err
	}
	if !WritesEnabled(session, profile) {
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
	scope string,
	successMsg string,
	mutate func(*models.SessionSnapshot),
) (models.WorkspaceSnapshot, error) {
	if s == nil || s.session == nil || s.workspace == nil {
		return models.WorkspaceSnapshot{}, errors.New("aws write service is not available")
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
	return s.finishAWSSelection(ctx, snapshot, session, notifier, scope, "success", successMsg, false)
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
