// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package labs

import (
	"context"
	"fmt"
)

// SettingStore persists arbitrary JSON values by key.
type SettingStore interface {
	SaveAppSetting(ctx context.Context, key string, value any) error
	LoadAppSetting(ctx context.Context, key string, target any) (bool, error)
}

// SessionStore persists lab sessions per deployment.
type SessionStore struct {
	store SettingStore
}

// NewSessionStore wraps a setting store for lab session persistence.
func NewSessionStore(store SettingStore) *SessionStore {
	return &SessionStore{store: store}
}

func sessionKey(deploymentID string) string {
	return "lab.session." + deploymentID
}

// Save writes a lab session for a deployment.
func (s *SessionStore) Save(ctx context.Context, session LabSession) error {
	if s == nil || s.store == nil {
		return fmt.Errorf("lab session store is not configured")
	}
	return s.store.SaveAppSetting(ctx, sessionKey(session.DeploymentID), session)
}

// Load reads a lab session for a deployment.
func (s *SessionStore) Load(ctx context.Context, deploymentID string) (LabSession, bool, error) {
	if s == nil || s.store == nil {
		return LabSession{}, false, fmt.Errorf("lab session store is not configured")
	}
	var session LabSession
	found, err := s.store.LoadAppSetting(ctx, sessionKey(deploymentID), &session)
	if err != nil || !found {
		return LabSession{}, found, err
	}
	return session, true, nil
}

// Delete removes a lab session for a deployment.
func (s *SessionStore) Delete(ctx context.Context, deploymentID string) error {
	if s == nil || s.store == nil {
		return fmt.Errorf("lab session store is not configured")
	}
	return s.store.SaveAppSetting(ctx, sessionKey(deploymentID), nil)
}