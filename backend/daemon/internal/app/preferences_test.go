// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

func TestSanitizeServicePreferencesIgnoresUnknownIDs(t *testing.T) {
	got := sanitizeServicePreferences(models.ServicePreferences{
		DisabledProviders: []string{"aws", "oracle", "azure"},
		DisabledServices: map[string][]string{
			"aws":    {"s3", "made-up", "ecs"},
			"oracle": {"vm"},
			"azure":  {"azure-storage", "azure-fake"},
		},
	})

	if len(got.DisabledProviders) != 2 || got.DisabledProviders[0] != "aws" || got.DisabledProviders[1] != "azure" {
		t.Fatalf("providers = %#v", got.DisabledProviders)
	}
	awsDisabled := got.DisabledServices["aws"]
	if len(awsDisabled) != 2 || awsDisabled[0] != "ecs" || awsDisabled[1] != "s3" {
		t.Fatalf("aws services = %#v", awsDisabled)
	}
	if _, ok := got.DisabledServices["oracle"]; ok {
		t.Fatalf("oracle services should be dropped: %#v", got.DisabledServices)
	}
	if azureDisabled := got.DisabledServices["azure"]; len(azureDisabled) != 1 || azureDisabled[0] != "azure-storage" {
		t.Fatalf("azure services = %#v", azureDisabled)
	}
}

func TestPreferencesRoundTripPersistsSanitisedState(t *testing.T) {
	dir := t.TempDir()
	settings := config.Settings{ConfigDir: dir}
	service := &Service{settings: settings, preferences: defaultServicePreferences()}

	service.preferences = sanitizeServicePreferences(models.ServicePreferences{
		DisabledProviders: []string{"gcp"},
		DisabledServices: map[string][]string{
			"aws": {"secrets", "unknown-tab"},
		},
	})
	if err := service.savePreferencesLocked(); err != nil {
		t.Fatalf("save preferences: %v", err)
	}

	loaded := &Service{settings: settings, preferences: defaultServicePreferences()}
	if err := loaded.loadPreferencesLocked(); err != nil {
		t.Fatalf("load preferences: %v", err)
	}
	if len(loaded.preferences.DisabledProviders) != 1 || loaded.preferences.DisabledProviders[0] != "gcp" {
		t.Fatalf("loaded providers = %#v", loaded.preferences.DisabledProviders)
	}
	if awsDisabled := loaded.preferences.DisabledServices["aws"]; len(awsDisabled) != 1 || awsDisabled[0] != "secrets" {
		t.Fatalf("loaded aws services = %#v", awsDisabled)
	}

	raw, err := os.ReadFile(filepath.Join(dir, preferencesFileName))
	if err != nil {
		t.Fatalf("read preferences file: %v", err)
	}
	var onDisk models.ServicePreferences
	if err := json.Unmarshal(raw, &onDisk); err != nil {
		t.Fatalf("decode preferences file: %v", err)
	}
	if _, ok := onDisk.DisabledServices["aws"]; !ok || onDisk.DisabledServices["aws"][0] != "secrets" {
		t.Fatalf("on-disk preferences = %#v", onDisk)
	}
}

func TestDefaultServicePreferencesEncodeEmptyProviderList(t *testing.T) {
	raw, err := json.Marshal(defaultServicePreferences())
	if err != nil {
		t.Fatalf("marshal default preferences: %v", err)
	}
	if string(raw) == `{"disabledProviders":null,"disabledServices":{}}` {
		t.Fatalf("default providers must not encode as null: %s", raw)
	}

	var decoded models.ServicePreferences
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("unmarshal default preferences: %v", err)
	}
	if decoded.DisabledProviders == nil {
		t.Fatal("decoded disabled providers should not be nil")
	}
}

func TestBuildPreferencesSnapshotNormalisesNilProviders(t *testing.T) {
	service := &Service{preferences: models.ServicePreferences{
		DisabledProviders: nil,
		DisabledServices:  nil,
	}}
	snapshot := service.buildPreferencesSnapshotLocked()
	if snapshot.Preferences.DisabledProviders == nil {
		t.Fatal("snapshot providers should not be nil")
	}
	if snapshot.Preferences.DisabledServices == nil {
		t.Fatal("snapshot services map should not be nil")
	}
}

func TestResetServicePreferencesLockedClearsStoredState(t *testing.T) {
	dir := t.TempDir()
	settings := config.Settings{ConfigDir: dir}
	service := &Service{settings: settings, preferences: defaultServicePreferences()}
	service.preferences = sanitizeServicePreferences(models.ServicePreferences{
		DisabledProviders: []string{"gcp"},
		DisabledServices: map[string][]string{
			"aws": {"s3"},
		},
	})
	if err := service.savePreferencesLocked(); err != nil {
		t.Fatalf("save preferences: %v", err)
	}

	if err := service.resetServicePreferencesLocked(); err != nil {
		t.Fatalf("reset preferences: %v", err)
	}
	if len(service.preferences.DisabledProviders) != 0 || len(service.preferences.DisabledServices) != 0 {
		t.Fatalf("in-memory preferences = %#v", service.preferences)
	}
	if _, err := os.Stat(filepath.Join(dir, preferencesFileName)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected preferences file to be removed, got err=%v", err)
	}
}

func TestBuildPreferencesSnapshotMarksDisabledServices(t *testing.T) {
	service := &Service{
		preferences: models.ServicePreferences{
			DisabledProviders: []string{"gcp"},
			DisabledServices: map[string][]string{
				"aws": {"ecs"},
			},
		},
	}
	snapshot := service.buildPreferencesSnapshotLocked()

	var ecsEntry *models.ServiceCatalogEntry
	var gcpStorageEntry *models.ServiceCatalogEntry
	for index := range snapshot.Catalogue {
		entry := snapshot.Catalogue[index]
		if entry.ProviderID == "aws" && entry.ServiceID == "ecs" {
			ecsEntry = &snapshot.Catalogue[index]
		}
		if entry.ProviderID == "gcp" && entry.ServiceID == "gcp-storage" {
			gcpStorageEntry = &snapshot.Catalogue[index]
		}
	}
	if ecsEntry == nil || ecsEntry.Enabled {
		t.Fatalf("ecs entry = %#v", ecsEntry)
	}
	if gcpStorageEntry == nil || gcpStorageEntry.Enabled {
		t.Fatalf("gcp storage entry = %#v", gcpStorageEntry)
	}
}