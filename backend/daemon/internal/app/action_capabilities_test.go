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
			{Label: "Region", Value: "eu-west-2"},
		},
	}
	session := models.SessionSnapshot{AWSWriteModeEnabled: true}
	caps := buildAWSActionCapabilities(session, profile)
	create := caps["lambda"][1]
	if !create.Enabled {
		t.Fatal("expected create enabled for real-cloud profile when write mode is on")
	}
}

func TestBuildAWSActionCapabilitiesIncludePhase2And3Writes(t *testing.T) {
	profile := models.ProfileSummary{
		Attributes: []models.DetailField{
			{Label: "endpoint_url", Value: "http://localhost:4566"},
			{Label: "cloudsprocket_allow_writes", Value: "true"},
		},
	}
	session := models.SessionSnapshot{AWSWriteModeEnabled: true}
	caps := buildAWSActionCapabilities(session, profile)

	for _, scope := range []struct {
		scope    string
		actionID string
	}{
		{"s3", "deleteObject"},
		{"s3", "createBucket"},
		{"s3", "copyObject"},
		{"s3", "createFolderPrefix"},
		{"ec2", "runInstances"},
		{"ec2", "terminateInstances"},
		{"lambda", "deleteFunction"},
		{"rds", "startInstance"},
		{"rds", "stopInstance"},
		{"logs", "createLogGroup"},
		{"logs", "putLogEvents"},
		{"iam", "createRole"},
	} {
		enabled := false
		for _, capability := range caps[scope.scope] {
			if capability.ActionID == scope.actionID {
				enabled = capability.Enabled
				break
			}
		}
		if !enabled {
			t.Fatalf("expected %s.%s to be enabled for local write mode", scope.scope, scope.actionID)
		}
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

func TestBuildGcpActionCapabilitiesWriteModeOff(t *testing.T) {
	profile := models.ProfileSummary{
		ProfileID: "default",
		Attributes: []models.DetailField{
			{Label: "Project", Value: "platform-prod"},
		},
	}
	session := models.SessionSnapshot{GcpWriteModeEnabled: false}
	caps := buildGcpActionCapabilities(session, profile)
	upload := caps["storage"][0]
	if upload.Enabled {
		t.Fatal("expected upload disabled when GCP write mode is off")
	}
	if upload.Reason == "" {
		t.Fatal("expected disabled reason for GCP write mode off")
	}
	start := caps["compute"][0]
	if start.Enabled {
		t.Fatal("expected start disabled when GCP write mode is off")
	}
}

func TestBuildGcpActionCapabilitiesWriteModeOn(t *testing.T) {
	profile := models.ProfileSummary{ProfileID: "default"}
	session := models.SessionSnapshot{GcpWriteModeEnabled: true}
	caps := buildGcpActionCapabilities(session, profile)
	for _, scope := range []struct {
		scope    string
		actionID string
	}{
		{"storage", "uploadObject"},
		{"storage", "deleteObject"},
		{"compute", "startInstance"},
		{"compute", "stopInstance"},
	} {
		enabled := false
		for _, capability := range caps[scope.scope] {
			if capability.ActionID == scope.actionID {
				enabled = capability.Enabled
				break
			}
		}
		if !enabled {
			t.Fatalf("expected %s.%s to be enabled when write mode is on", scope.scope, scope.actionID)
		}
	}
}
