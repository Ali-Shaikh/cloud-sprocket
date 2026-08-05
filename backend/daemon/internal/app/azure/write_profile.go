// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azure

import (
	"net"
	"net/url"
	"strings"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

const azureLocalTenantMarker = "cloudsprocket-local"

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

// IsLocalFlociProfile reports whether the profile targets local floci-az.
func IsLocalFlociProfile(profile models.ProfileSummary) bool {
	for _, field := range profile.Attributes {
		if field.Label == "Tenant ID" && strings.EqualFold(strings.TrimSpace(field.Value), azureLocalTenantMarker) {
			return true
		}
	}
	return false
}

// ProfileAzureEndpointURL returns a floci-az endpoint when the profile is local.
func ProfileAzureEndpointURL(profile models.ProfileSummary, defaultFlociEndpoint string) string {
	for _, field := range profile.Attributes {
		if normaliseProfileFieldLabel(field.Label) == "flociazendpoint" {
			if value := strings.TrimSpace(field.Value); value != "" {
				return strings.TrimRight(value, "/")
			}
		}
	}
	if IsLocalFlociProfile(profile) {
		endpoint := strings.TrimRight(strings.TrimSpace(defaultFlociEndpoint), "/")
		if endpoint == "" {
			return "http://localhost:4577"
		}
		return endpoint
	}
	return ""
}

// ProfileAllowsWrites reports whether the profile can enable Azure write mode
// (local floci or a discovered Azure CLI command path).
func ProfileAllowsWrites(profile models.ProfileSummary, providerCommandPath string) bool {
	if IsLocalFlociProfile(profile) {
		return true
	}
	if strings.TrimSpace(providerCommandPath) == "" {
		return false
	}
	endpoint := ProfileAzureEndpointURL(profile, "")
	if endpoint != "" {
		parsed, err := url.Parse(endpoint)
		if err == nil {
			host := parsed.Hostname()
			if host == "localhost" || host == "127.0.0.1" {
				return true
			}
			if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
				return true
			}
		}
	}
	return strings.TrimSpace(providerCommandPath) != ""
}

// WritesEnabled reports whether Azure write mode is on for the session/profile.
func WritesEnabled(session models.SessionSnapshot, profile models.ProfileSummary, providerCommandPath string) bool {
	return session.AzureWriteModeEnabled && ProfileAllowsWrites(profile, providerCommandPath)
}

// ProviderCommandPath returns the Azure provider command path from discovery.
func ProviderCommandPath(snapshot discovery.Snapshot) string {
	for _, provider := range snapshot.Providers {
		if provider.ProviderID == "azure" {
			return provider.CommandPath
		}
	}
	return ""
}

// LockedAzureProfile resolves the active Azure profile for a locked workspace.
func LockedAzureProfile(snapshotProfiles []models.ProfileSummary, session models.SessionSnapshot, openMsg string) (models.ProfileSummary, error) {
	if !session.IsLocked || session.CurrentProviderID != "azure" {
		return models.ProfileSummary{}, errString(openMsg)
	}
	profile, ok := FindProfile(FilterProfiles(snapshotProfiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return models.ProfileSummary{}, errString("the workspace's Azure profile is not available")
	}
	return profile, nil
}

func normaliseProfileFieldLabel(label string) string {
	return strings.ToLower(strings.ReplaceAll(strings.TrimSpace(label), " ", ""))
}

type stringError string

func (e stringError) Error() string { return string(e) }

func errString(msg string) error {
	msg = strings.TrimSpace(msg)
	if msg == "" {
		msg = "azure error"
	}
	return stringError(msg)
}
