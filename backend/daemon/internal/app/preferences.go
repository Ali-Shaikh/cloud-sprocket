// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

const preferencesFileName = "preferences.json"

func (s *Service) preferencesPath() string {
	return filepath.Join(s.settings.ConfigDir, preferencesFileName)
}

func (s *Service) loadPreferencesLocked() error {
	path := s.preferencesPath()
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			s.preferences = defaultServicePreferences()
			return nil
		}
		return err
	}
	var stored models.ServicePreferences
	if err := json.Unmarshal(data, &stored); err != nil {
		return err
	}
	s.preferences = sanitizeServicePreferences(stored)
	return nil
}

func (s *Service) savePreferencesLocked() error {
	if err := os.MkdirAll(s.settings.ConfigDir, 0o755); err != nil {
		return err
	}
	encoded, err := json.MarshalIndent(s.preferences, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.preferencesPath(), encoded, 0o600)
}

func (s *Service) resetServicePreferencesLocked() error {
	s.preferences = defaultServicePreferences()
	if err := os.Remove(s.preferencesPath()); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func defaultServicePreferences() models.ServicePreferences {
	return models.ServicePreferences{
		DisabledProviders: []string{},
		DisabledServices:  map[string][]string{},
	}
}

func sanitizeServicePreferences(input models.ServicePreferences) models.ServicePreferences {
	knownProviders := knownCatalogProviderIDs()
	knownServices := knownCatalogServiceIDs()

	disabledProviders := make([]string, 0, len(input.DisabledProviders))
	for _, providerID := range input.DisabledProviders {
		providerID = strings.TrimSpace(strings.ToLower(providerID))
		if providerID == "" {
			continue
		}
		if _, ok := knownProviders[providerID]; !ok {
			continue
		}
		if !slices.Contains(disabledProviders, providerID) {
			disabledProviders = append(disabledProviders, providerID)
		}
	}
	slices.Sort(disabledProviders)

	disabledServices := map[string][]string{}
	for providerID, serviceIDs := range input.DisabledServices {
		providerID = strings.TrimSpace(strings.ToLower(providerID))
		if providerID == "" {
			continue
		}
		providerServices, ok := knownServices[providerID]
		if !ok {
			continue
		}
		normalised := make([]string, 0, len(serviceIDs))
		for _, serviceID := range serviceIDs {
			serviceID = strings.TrimSpace(strings.ToLower(serviceID))
			if serviceID == "" {
				continue
			}
			if _, known := providerServices[serviceID]; !known {
				continue
			}
			if !slices.Contains(normalised, serviceID) {
				normalised = append(normalised, serviceID)
			}
		}
		if len(normalised) > 0 {
			slices.Sort(normalised)
			disabledServices[providerID] = normalised
		}
	}

	return models.ServicePreferences{
		DisabledProviders: disabledProviders,
		DisabledServices:  disabledServices,
	}
}

func (s *Service) isProviderEnabledLocked(providerID string) bool {
	providerID = strings.TrimSpace(strings.ToLower(providerID))
	if providerID == "" {
		return true
	}
	return !slices.Contains(s.preferences.DisabledProviders, providerID)
}

func (s *Service) isServiceEnabledLocked(providerID, serviceID string) bool {
	providerID = strings.TrimSpace(strings.ToLower(providerID))
	serviceID = strings.TrimSpace(strings.ToLower(serviceID))
	if providerID == "" || serviceID == "" {
		return true
	}
	if !s.isProviderEnabledLocked(providerID) {
		return false
	}
	disabled := s.preferences.DisabledServices[providerID]
	return !slices.Contains(disabled, serviceID)
}

func (s *Service) isProviderEnabled(providerID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.isProviderEnabledLocked(providerID)
}

func (s *Service) isServiceEnabled(providerID, serviceID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.isServiceEnabledLocked(providerID, serviceID)
}

func (s *Service) anyServiceEnabled(providerID string, serviceIDs []string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, serviceID := range serviceIDs {
		if s.isServiceEnabledLocked(providerID, serviceID) {
			return true
		}
	}
	return false
}

func (s *Service) buildPreferencesSnapshotLocked() models.PreferencesSnapshot {
	catalogue := make([]models.ServiceCatalogEntry, 0, len(allServiceCatalogEntries()))
	for _, entry := range allServiceCatalogEntries() {
		catalogue = append(catalogue, catalogEntryToModel(
			entry,
			s.isServiceEnabledLocked(entry.ProviderID, entry.ServiceID),
		))
	}
	return models.PreferencesSnapshot{
		Preferences: sanitizeServicePreferences(s.preferences),
		Catalogue:   catalogue,
	}
}