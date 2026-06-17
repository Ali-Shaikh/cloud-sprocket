package app

import (
	"net"
	"net/url"
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

const azureLocalTenantMarker = "cloudsprocket-local"

func isLocalFlociProfile(profile models.ProfileSummary) bool {
	for _, field := range profile.Attributes {
		if field.Label == "Tenant ID" && strings.EqualFold(strings.TrimSpace(field.Value), azureLocalTenantMarker) {
			return true
		}
	}
	return false
}

func profileAzureEndpointURL(profile models.ProfileSummary, defaultFlociEndpoint string) string {
	for _, field := range profile.Attributes {
		if normaliseProfileFieldLabel(field.Label) == "flociazendpoint" {
			if value := strings.TrimSpace(field.Value); value != "" {
				return strings.TrimRight(value, "/")
			}
		}
	}
	if isLocalFlociProfile(profile) {
		endpoint := strings.TrimRight(strings.TrimSpace(defaultFlociEndpoint), "/")
		if endpoint == "" {
			return "http://localhost:4577"
		}
		return endpoint
	}
	return ""
}

func profileAllowsAzureWrites(profile models.ProfileSummary, providerCommandPath string) bool {
	if isLocalFlociProfile(profile) {
		return true
	}
	if strings.TrimSpace(providerCommandPath) == "" {
		return false
	}
	endpoint := profileAzureEndpointURL(profile, "")
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

func effectiveAzureWritesEnabled(
	session models.SessionSnapshot,
	profile models.ProfileSummary,
	providerCommandPath string,
) bool {
	return session.AzureWriteModeEnabled && profileAllowsAzureWrites(profile, providerCommandPath)
}

func azureWriteTargetSummary(profile models.ProfileSummary, defaultFlociEndpoint string) string {
	if isLocalFlociProfile(profile) {
		return profileAzureEndpointURL(profile, defaultFlociEndpoint)
	}
	return "Azure CLI (" + profile.DisplayName + ")"
}