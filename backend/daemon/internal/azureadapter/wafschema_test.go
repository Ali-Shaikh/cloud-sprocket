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

