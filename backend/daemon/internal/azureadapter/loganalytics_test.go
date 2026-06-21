// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

type fakeCLI struct {
	out  []byte
	err  error
	args []string
}

func (f *fakeCLI) CommandContext(_ context.Context, _ string, args ...string) ([]byte, error) {
	f.args = args
	return f.out, f.err
}

func cloudAzureProfile() models.ProfileSummary {
	return models.ProfileSummary{
		ProviderID: "azure",
		ProfileID:  "11111111-2222-3333-4444-555555555555",
		Attributes: []models.DetailField{{Label: "Tenant ID", Value: "real-tenant-guid"}},
	}
}

func TestParseAzCLIRowsPreservesColumnOrder(t *testing.T) {
	payload := []byte(`[
		{"TimeGenerated":"2026-06-17T10:00:00Z","Level":"Info","Count":5},
		{"TimeGenerated":"2026-06-17T10:01:00Z","Level":"Error","Count":2}
	]`)
	result, err := parseAzCLIRows(payload)
	if err != nil {
		t.Fatalf("parseAzCLIRows: %v", err)
	}
	wantCols := []string{"TimeGenerated", "Level", "Count"}
	if strings.Join(result.Columns, ",") != strings.Join(wantCols, ",") {
		t.Fatalf("columns = %v, want %v", result.Columns, wantCols)
	}
	if len(result.Rows) != 2 {
		t.Fatalf("rows = %d, want 2", len(result.Rows))
	}
	if result.Rows[0][1] != "Info" || result.Rows[0][2] != "5" {
		t.Fatalf("row 0 = %v, want [..,Info,5]", result.Rows[0])
	}
	if result.Rows[1][2] != "2" {
		t.Fatalf("row 1 count = %q, want 2", result.Rows[1][2])
	}
}

func TestParseAzCLIRowsEmpty(t *testing.T) {
	result, err := parseAzCLIRows([]byte(`[]`))
	if err != nil {
		t.Fatalf("parseAzCLIRows: %v", err)
	}
	if len(result.Columns) != 0 || len(result.Rows) != 0 {
		t.Fatalf("expected empty result, got %+v", result)
	}
}

func TestRunLogAnalyticsQueryCloud(t *testing.T) {
	fake := &fakeCLI{out: []byte(`[{"Level":"Info","Count":3}]`)}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	result, err := inv.RunLogAnalyticsQuery(context.Background(), cloudAzureProfile(), "ws-1", "AppLogs | summarize count()", "", 0)
	if err != nil {
		t.Fatalf("RunLogAnalyticsQuery: %v", err)
	}
	if len(result.Rows) != 1 || result.Rows[0][0] != "Info" || result.Rows[0][1] != "3" {
		t.Fatalf("unexpected result: %+v", result)
	}
	joined := strings.Join(fake.args, " ")
	if !strings.Contains(joined, "log-analytics query") || !strings.Contains(joined, "ws-1") {
		t.Fatalf("az args missing query/workspace: %v", fake.args)
	}
}

func TestRunLogAnalyticsQueryLocalFloci(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !strings.Contains(r.URL.Path, "/v1/workspaces/") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"tables":[{"name":"PrimaryResult","columns":[{"name":"Level","type":"string"},{"name":"Count","type":"long"}],"rows":[["Info",5],["Error",2]]}]}`)
	}))
	t.Cleanup(server.Close)

	inv := newLocalInventory(server.URL)
	result, err := inv.RunLogAnalyticsQuery(context.Background(), localFlociProfile(), "ws-guid", "AppLogs", "", 0)
	if err != nil {
		t.Fatalf("RunLogAnalyticsQuery local: %v", err)
	}
	if strings.Join(result.Columns, ",") != "Level,Count" {
		t.Fatalf("columns = %v", result.Columns)
	}
	if len(result.Rows) != 2 || result.Rows[1][0] != "Error" || result.Rows[1][1] != "2" {
		t.Fatalf("unexpected rows: %v", result.Rows)
	}
}

func TestApplyLogAnalyticsRowCap(t *testing.T) {
	base := models.AzureLogQueryResult{
		Columns: []string{"Id"},
		Rows:    [][]string{{"1"}, {"2"}, {"3"}},
	}
	capped := applyLogAnalyticsRowCap(base, 2)
	if !capped.Truncated || len(capped.Rows) != 2 {
		t.Fatalf("expected truncated cap of 2 rows, got %+v", capped)
	}
	if capped.Rows[1][0] != "2" {
		t.Fatalf("expected first two rows preserved, got %v", capped.Rows)
	}
}

func TestListLogAnalyticsWorkspacesLocalFloci(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(strings.ToLower(r.URL.Path), "microsoft.operationalinsights/workspaces") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"value":[{"name":"law-b","location":"westeurope","properties":{"customerId":"guid-b"}},{"name":"law-a","location":"westeurope","properties":{"customerId":"guid-a"}}]}`)
	}))
	t.Cleanup(server.Close)

	inv := newLocalInventory(server.URL)
	workspaces, err := inv.ListLogAnalyticsWorkspaces(context.Background(), localFlociProfile())
	if err != nil {
		t.Fatalf("ListLogAnalyticsWorkspaces: %v", err)
	}
	if len(workspaces) != 2 || workspaces[0].Name != "law-a" || workspaces[0].CustomerID != "guid-a" {
		t.Fatalf("expected sorted workspaces, got %+v", workspaces)
	}
}
