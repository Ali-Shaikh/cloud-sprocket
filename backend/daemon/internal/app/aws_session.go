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

// awsWriteSelection resolves the profile, region, and target resource id for a
// write/peek action from the current session and request. Each service supplies
// one (activeSQSSelection, activeSNSSelection, activeDynamoDBSelection).
type awsWriteSelection func(discovery.Snapshot, models.SessionSnapshot) (models.ProfileSummary, string, string, error)

// authorizeAWSWriteSelection holds the service lock once to read the session,
// resolve the action's target via selection, and enforce the write gate, then
// releases the lock and returns the resolved (profile, region, resourceID). It
// removes the repeated lock/unlock-on-every-return boilerplate from the
// selection-based action handlers (peek, send, publish, put, delete).
func (s *Service) authorizeAWSWriteSelection(
	ctx context.Context,
	snapshot discovery.Snapshot,
	gateMsg string,
	selection awsWriteSelection,
) (models.ProfileSummary, string, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		return models.ProfileSummary{}, "", "", err
	}
	profile, region, resourceID, err := selection(snapshot, session)
	if err != nil {
		return models.ProfileSummary{}, "", "", err
	}
	if !effectiveAWSWritesEnabled(session, profile) {
		return models.ProfileSummary{}, "", "", errors.New(gateMsg)
	}
	return profile, region, resourceID, nil
}

// authorizeAWSWrite holds the service lock once to verify an AWS workspace is
// open with write mode enabled for the active profile, then releases it and
// returns the session and profile. Used by create handlers that derive their
// region from a service-specific session field after authorisation.
func (s *Service) authorizeAWSWrite(
	ctx context.Context,
	snapshot discovery.Snapshot,
	openMsg string,
	gateMsg string,
) (models.SessionSnapshot, models.ProfileSummary, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		return models.SessionSnapshot{}, models.ProfileSummary{}, err
	}
	if !session.IsLocked || session.CurrentProviderID != "aws" {
		return models.SessionSnapshot{}, models.ProfileSummary{}, errors.New(openMsg)
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return models.SessionSnapshot{}, models.ProfileSummary{}, errors.New("the workspace's AWS profile is not available")
	}
	if !effectiveAWSWritesEnabled(session, profile) {
		return models.SessionSnapshot{}, models.ProfileSummary{}, errors.New(gateMsg)
	}
	return session, profile, nil
}

// finishAWSWriteAction reconciles the session after a successful write (applying
// mutate, e.g. selecting the newly created resource), persists it, and returns a
// fresh workspace snapshot scoped to one service. The lock is held only for the
// session reconcile, then released before the slow snapshot build (the same
// contract as handleWorkspaceGet).
func (s *Service) finishAWSWriteAction(
	ctx context.Context,
	snapshot discovery.Snapshot,
	notifier Notifier,
	scope string,
	successMsg string,
	mutate func(*models.SessionSnapshot),
) (models.WorkspaceSnapshot, error) {
	s.mu.Lock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return models.WorkspaceSnapshot{}, err
	}
	mutate(&session)
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return models.WorkspaceSnapshot{}, err
	}
	s.mu.Unlock()
	return s.finishAWSWorkspaceOpts(
		ctx,
		snapshot,
		session,
		notifier,
		workspaceSnapshotOptions{awsScope: scope, skipAzureInventory: true},
		"success",
		successMsg,
		false,
	)
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
