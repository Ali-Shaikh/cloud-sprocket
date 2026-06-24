// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"testing"
)

func TestDiagnosticsSchemaProfileUsesKnownColumns(t *testing.T) {
	profile := diagnosticsSchemaProfile([]string{
		"TimeGenerated", "Category", "action_s", "trackingReference_s", "details_matches_s",
	})
	if profile.TableName != wafDiagnosticsTable {
		t.Fatalf("table = %q, want %q", profile.TableName, wafDiagnosticsTable)
	}
	if profile.Columns.TrackingReference != "trackingReference_s" {
		t.Fatalf("tracking column = %q", profile.Columns.TrackingReference)
	}
}

func TestPickColumnPrefersExistingColumn(t *testing.T) {
	got := pickColumn([]string{"Action", "RuleName"}, "action_s", "Action")
	if got != "Action" {
		t.Fatalf("pickColumn = %q, want Action", got)
	}
}

func TestPickColumnReturnsEmptyWhenColumnAbsent(t *testing.T) {
	got := pickColumn([]string{"action_s", "details_matches_s"}, "details_msg_s")
	if got != "" {
		t.Fatalf("pickColumn = %q, want empty when column is not in workspace", got)
	}
}

func TestDiagnosticsSchemaProfileMatchesFrontDoorCustomerLogs(t *testing.T) {
	profile := diagnosticsSchemaProfile([]string{
		"TimeGenerated", "Category", "action_s", "clientIP_s", "clientPort_s",
		"details_matches_s", "host_s", "policyMode_s", "policy_s", "requestUri_s",
		"ruleName_s", "socketIP_s", "trackingReference_s",
	})
	if profile.Columns.ClientIP != "clientIP_s" {
		t.Fatalf("client IP column = %q", profile.Columns.ClientIP)
	}
	if profile.Columns.Host != "host_s" {
		t.Fatalf("host column = %q", profile.Columns.Host)
	}
	if profile.Columns.DetailsMatches != "details_matches_s" {
		t.Fatalf("details matches column = %q", profile.Columns.DetailsMatches)
	}
	if profile.Columns.DetailsMessage != "" {
		t.Fatalf("details message column = %q, want empty when absent", profile.Columns.DetailsMessage)
	}
	if profile.Columns.DetailsData != "" {
		t.Fatalf("details data column = %q, want empty when absent", profile.Columns.DetailsData)
	}
}

