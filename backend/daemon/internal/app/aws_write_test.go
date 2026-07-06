// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"testing"

	"cloudsprocket/backend/daemon/internal/models"
)

func TestEffectiveAWSWritesEnabledRequiresSessionAndProfile(t *testing.T) {
	profile := models.ProfileSummary{
		ProviderID: "aws",
		ProfileID:  "localstack",
		Attributes: []models.DetailField{
			{Label: "endpoint_url", Value: "http://localhost:4566"},
			{Label: "cloudsprocket_allow_writes", Value: "true"},
		},
	}

	session := models.SessionSnapshot{
		AWSWriteModeEnabled: false,
	}
	if effectiveAWSWritesEnabled(session, profile) {
		t.Fatal("expected write gate to reject disabled write mode")
	}

	session.IsLocked = true
	session.AWSWriteModeEnabled = true
	if !effectiveAWSWritesEnabled(session, profile) {
		t.Fatal("expected write gate to allow local endpoint with writes enabled")
	}

	realProfile := models.ProfileSummary{
		ProviderID: "aws",
		ProfileID:  "production",
		Attributes: []models.DetailField{
			{Label: "Region", Value: "eu-west-2"},
		},
	}
	if !effectiveAWSWritesEnabled(session, realProfile) {
		t.Fatal("expected write gate to allow live AWS profile when write mode is enabled")
	}

	session.AWSWriteModeEnabled = false
	if effectiveAWSWritesEnabled(session, realProfile) {
		t.Fatal("expected write gate to reject when write mode is disabled")
	}
}

func TestProfileIsLocalAWSEndpoint(t *testing.T) {
	local := models.ProfileSummary{
		Attributes: []models.DetailField{
			{Label: "Endpoint Url", Value: "http://localhost:4566"},
		},
	}
	if !profileIsLocalAWSEndpoint(local) {
		t.Fatal("expected localhost endpoint to be treated as local")
	}

	cloud := models.ProfileSummary{
		Attributes: []models.DetailField{
			{Label: "Region", Value: "me-central-1"},
		},
	}
	if profileIsLocalAWSEndpoint(cloud) {
		t.Fatal("expected real cloud profile without endpoint override to stay non-local")
	}
}