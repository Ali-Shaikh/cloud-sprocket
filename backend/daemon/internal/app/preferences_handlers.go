// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"encoding/json"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) handlePreferencesGet() (any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.buildPreferencesSnapshotLocked(), nil
}

func (s *Service) handlePreferencesUpdate(params json.RawMessage) (any, error) {
	var request models.ServicePreferences
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.preferences = sanitizeServicePreferences(request)
	if err := s.savePreferencesLocked(); err != nil {
		return nil, err
	}
	return s.buildPreferencesSnapshotLocked(), nil
}