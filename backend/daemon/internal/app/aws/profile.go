// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package aws

import (
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

const writeModeRequiredMessage = "Turn on write mode from the top bar to run mutating actions."

// FilterProfiles returns profiles for the given provider.
func FilterProfiles(profiles []models.ProfileSummary, providerID string) []models.ProfileSummary {
	if providerID == "" {
		return append([]models.ProfileSummary(nil), profiles...)
	}
	filtered := []models.ProfileSummary{}
	for _, profile := range profiles {
		if profile.ProviderID == providerID {
			filtered = append(filtered, profile)
		}
	}
	return filtered
}

// FindProfile returns the profile with the given id.
func FindProfile(profiles []models.ProfileSummary, profileID string) (models.ProfileSummary, bool) {
	for _, profile := range profiles {
		if profile.ProfileID == profileID {
			return profile, true
		}
	}
	return models.ProfileSummary{}, false
}

// ProfileRegionHint returns the profile region attribute or us-east-1.
func ProfileRegionHint(profile models.ProfileSummary) string {
	for _, field := range profile.Attributes {
		if field.Label == "Region" && field.Value != "" {
			return field.Value
		}
	}
	return "us-east-1"
}

// WritesEnabled reports whether AWS write mode is on for the session.
func WritesEnabled(session models.SessionSnapshot, _ models.ProfileSummary) bool {
	return session.IsLocked && session.AWSWriteModeEnabled
}

// ActionGate mirrors the façade write-mode gate used by reveal-style actions.
func ActionGate(session models.SessionSnapshot, profile models.ProfileSummary) (enabled bool, reason string) {
	if !session.AWSWriteModeEnabled {
		return false, writeModeRequiredMessage
	}
	_ = profile
	return true, ""
}

// LockedAWSProfile resolves the active AWS profile for a locked workspace.
func LockedAWSProfile(snapshotProfiles []models.ProfileSummary, session models.SessionSnapshot, openMsg string) (models.ProfileSummary, error) {
	if !session.IsLocked || session.CurrentProviderID != "aws" {
		return models.ProfileSummary{}, errString(openMsg)
	}
	profile, ok := FindProfile(FilterProfiles(snapshotProfiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return models.ProfileSummary{}, errString("the workspace's AWS profile is not available")
	}
	return profile, nil
}

type stringError string

func (e stringError) Error() string { return string(e) }

func errString(msg string) error {
	msg = strings.TrimSpace(msg)
	if msg == "" {
		msg = "aws error"
	}
	return stringError(msg)
}
