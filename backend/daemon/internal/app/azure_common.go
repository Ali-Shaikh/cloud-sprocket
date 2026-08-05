// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	appazure "cloudsprocket/backend/daemon/internal/app/azure"
	"cloudsprocket/backend/daemon/internal/models"
)

// Azure write-gate helpers are owned by internal/app/azure (F-029 Phase 5c).
// The façade keeps thin wrappers so existing call sites stay stable.

func isLocalFlociProfile(profile models.ProfileSummary) bool {
	return appazure.IsLocalFlociProfile(profile)
}

func profileAzureEndpointURL(profile models.ProfileSummary, defaultFlociEndpoint string) string {
	return appazure.ProfileAzureEndpointURL(profile, defaultFlociEndpoint)
}

func profileAllowsAzureWrites(profile models.ProfileSummary, providerCommandPath string) bool {
	return appazure.ProfileAllowsWrites(profile, providerCommandPath)
}

func effectiveAzureWritesEnabled(
	session models.SessionSnapshot,
	profile models.ProfileSummary,
	providerCommandPath string,
) bool {
	return appazure.WritesEnabled(session, profile, providerCommandPath)
}

func azureWriteTargetSummary(profile models.ProfileSummary, defaultFlociEndpoint string) string {
	if appazure.IsLocalFlociProfile(profile) {
		return appazure.ProfileAzureEndpointURL(profile, defaultFlociEndpoint)
	}
	return "Azure CLI (" + profile.DisplayName + ")"
}
