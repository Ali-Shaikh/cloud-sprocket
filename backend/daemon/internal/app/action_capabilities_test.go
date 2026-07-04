// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"testing"

	"cloudsprocket/backend/daemon/internal/models"
)

func TestBuildAWSActionCapabilitiesWriteModeOff(t *testing.T) {
	profile := models.ProfileSummary{
		Attributes: []models.DetailField{
			{Label: "endpoint_url", Value: "http://localhost:4566"},
			{Label: "cloudsprocket_allow_writes", Value: "true"},
		},
	}
	session := models.SessionSnapshot{AWSWriteModeEnabled: false}
	caps := buildAWSActionCapabilities(session, profile)
	invoke := caps["lambda"][0]
	if invoke.Enabled {
		t.Fatal("expected invoke disabled when write mode is off")
	}
	if invoke.Reason == "" {
		t.Fatal("expected disabled reason for write mode off")
	}
}

func TestBuildAWSActionCapabilitiesRealCloudProfile(t *testing.T) {
	profile := models.ProfileSummary{
		Attributes: []models.DetailField{
			{Label: "endpoint_url", Value: "https://s3.amazonaws.com"},
		},
	}
	session := models.SessionSnapshot{AWSWriteModeEnabled: true}
	caps := buildAWSActionCapabilities(session, profile)
	create := caps["lambda"][1]
	if create.Enabled {
		t.Fatal("expected create disabled for real-cloud profile")
	}
}

func TestBuildAzureActionCapabilitiesWriteModeOff(t *testing.T) {
	profile := models.ProfileSummary{
		Attributes: []models.DetailField{
			{Label: "Tenant ID", Value: "cloudsprocket-local"},
		},
	}
	session := models.SessionSnapshot{AzureWriteModeEnabled: false}
	caps := buildAzureActionCapabilities(session, profile, "")
	invoke := caps["functions"][0]
	if invoke.Enabled {
		t.Fatal("expected invoke disabled when Azure write mode is off")
	}
	if invoke.Reason == "" {
		t.Fatal("expected disabled reason for Azure write mode off")
	}
}