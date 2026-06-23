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

	session.AWSWriteModeEnabled = true
	if !effectiveAWSWritesEnabled(session, profile) {
		t.Fatal("expected write gate to allow local endpoint with writes enabled")
	}

	realProfile := models.ProfileSummary{
		ProviderID: "aws",
		ProfileID:  "production",
		Attributes: []models.DetailField{
			{Label: "endpoint_url", Value: "https://s3.amazonaws.com"},
			{Label: "cloudsprocket_allow_writes", Value: "true"},
		},
	}
	if effectiveAWSWritesEnabled(session, realProfile) {
		t.Fatal("expected write gate to reject non-local endpoint even when allow_writes is true")
	}
}