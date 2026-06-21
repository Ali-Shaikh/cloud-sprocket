// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"cloudsprocket/backend/daemon/internal/models"
)

// logAnalyticsQueryTimeout bounds a KQL run so a slow workspace fails fast.
const logAnalyticsQueryTimeout = 30 * time.Second

// DefaultLogAnalyticsMaxRows is the row cap applied when the caller omits maxRows.
const DefaultLogAnalyticsMaxRows = 5000

// ListLogAnalyticsWorkspaces returns the Log Analytics workspaces visible to the
// profile. floci-az serves the OperationalInsights ARM list locally; real Azure
// uses the az CLI.
func (i *Inventory) ListLogAnalyticsWorkspaces(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.AzureLogAnalyticsWorkspace, error) {
	if isLocalFlociProfile(profile) {
		return i.listLocalLogAnalyticsWorkspaces(ctx)
	}
	args := []string{
		"monitor", "log-analytics", "workspace", "list",
		"--subscription", profile.ProfileID,
		"--output", "json",
		"--only-show-errors",
	}
	payload, err := i.run(ctx, args...)
	if err != nil {
		return nil, err
	}
	return decodeLogAnalyticsWorkspaces(payload)
}

// ListLogAnalyticsTables returns table names (and optional columns) for a workspace.
func (i *Inventory) ListLogAnalyticsTables(
	ctx context.Context,
	profile models.ProfileSummary,
	workspaceName string,
	resourceGroup string,
	includeColumns bool,
) ([]models.AzureLogAnalyticsTableInfo, error) {
	workspaceName = strings.TrimSpace(workspaceName)
	if workspaceName == "" {
		return nil, fmt.Errorf("a workspace name is required")
	}
	if isLocalFlociProfile(profile) {
		query := "search * | distinct $table | order by $table asc"
		workspaces := []models.AzureLogAnalyticsWorkspace{{Name: workspaceName, CustomerID: workspaceName}}
		workspaceID, err := azureLogAnalyticsQueryWorkspaceLocal(workspaceName, workspaces)
		if err != nil {
			workspaceID = workspaceName
		}
		result, err := i.runLocalLogAnalyticsQuery(ctx, workspaceID, query, "P7D")
		if err != nil {
			return []models.AzureLogAnalyticsTableInfo{}, nil
		}
		tables := make([]models.AzureLogAnalyticsTableInfo, 0, len(result.Rows))
		tableIndex := indexOfColumn(result.Columns, "Table")
		if tableIndex < 0 {
			tableIndex = 0
		}
		for _, row := range result.Rows {
			if tableIndex >= len(row) || strings.TrimSpace(row[tableIndex]) == "" {
				continue
			}
			tables = append(tables, models.AzureLogAnalyticsTableInfo{Name: row[tableIndex]})
		}
		return tables, nil
	}
	resourceGroup = strings.TrimSpace(resourceGroup)
	if resourceGroup == "" {
		return nil, fmt.Errorf("a resource group is required to list tables on cloud Azure")
	}
	args := []string{
		"monitor", "log-analytics", "workspace", "table", "list",
		"--subscription", profile.ProfileID,
		"--resource-group", resourceGroup,
		"--workspace-name", workspaceName,
		"--output", "json",
		"--only-show-errors",
	}
	payload, err := i.run(ctx, args...)
	if err != nil {
		return nil, err
	}
	var decoded []struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("decode log analytics tables: %w", err)
	}
	tables := make([]models.AzureLogAnalyticsTableInfo, 0, len(decoded))
	workspaces, _ := i.ListLogAnalyticsWorkspaces(ctx, profile)
	workspaceID, err := azureLogAnalyticsQueryWorkspaceLocal(workspaceName, workspaces)
	if err != nil {
		return nil, err
	}
	for _, item := range decoded {
		info := models.AzureLogAnalyticsTableInfo{Name: item.Name}
		if includeColumns {
			schemaQuery := fmt.Sprintf("%s | getschema", item.Name)
			schemaResult, schemaErr := i.RunLogAnalyticsQuery(ctx, profile, workspaceID, schemaQuery, "", 500)
			if schemaErr == nil {
				columnIndex := indexOfColumn(schemaResult.Columns, "ColumnName")
				if columnIndex < 0 {
					columnIndex = indexOfColumn(schemaResult.Columns, "Column")
				}
				for _, row := range schemaResult.Rows {
					if columnIndex >= 0 && columnIndex < len(row) && strings.TrimSpace(row[columnIndex]) != "" {
						info.Columns = append(info.Columns, row[columnIndex])
					}
				}
			}
		}
		tables = append(tables, info)
	}
	return tables, nil
}

func azureLogAnalyticsQueryWorkspaceLocal(
	selection string,
	workspaces []models.AzureLogAnalyticsWorkspace,
) (string, error) {
	selection = strings.TrimSpace(selection)
	for _, workspace := range workspaces {
		if workspace.Name == selection || workspace.CustomerID == selection {
			if customerID := strings.TrimSpace(workspace.CustomerID); customerID != "" {
				return customerID, nil
			}
			return workspace.Name, nil
		}
	}
	return selection, nil
}

func indexOfColumn(columns []string, name string) int {
	for index, column := range columns {
		if strings.EqualFold(column, name) {
			return index
		}
	}
	return -1
}

func decodeLogAnalyticsWorkspaces(payload []byte) ([]models.AzureLogAnalyticsWorkspace, error) {
	var decoded []struct {
		Name          string `json:"name"`
		ResourceGroup string `json:"resourceGroup"`
		Location      string `json:"location"`
		CustomerID    string `json:"customerId"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("decode log analytics workspaces: %w", err)
	}
	workspaces := make([]models.AzureLogAnalyticsWorkspace, 0, len(decoded))
	for _, item := range decoded {
		workspaces = append(workspaces, models.AzureLogAnalyticsWorkspace{
			Name:          item.Name,
			ResourceGroup: item.ResourceGroup,
			Location:      item.Location,
			CustomerID:    item.CustomerID,
		})
	}
	sort.Slice(workspaces, func(left, right int) bool {
		return strings.ToLower(workspaces[left].Name) < strings.ToLower(workspaces[right].Name)
	})
	return workspaces, nil
}

func (i *Inventory) listLocalLogAnalyticsWorkspaces(ctx context.Context) ([]models.AzureLogAnalyticsWorkspace, error) {
	url := fmt.Sprintf("%s/subscriptions/%s/providers/Microsoft.OperationalInsights/workspaces?api-version=2022-10-01",
		i.flociBaseURL(), i.localSubscriptionID)
	var decoded struct {
		Value []struct {
			Name       string `json:"name"`
			Location   string `json:"location"`
			Properties struct {
				CustomerID string `json:"customerId"`
			} `json:"properties"`
		} `json:"value"`
	}
	if err := i.flociJSON(ctx, http.MethodGet, url, nil, &decoded); err != nil {
		return nil, err
	}
	workspaces := make([]models.AzureLogAnalyticsWorkspace, 0, len(decoded.Value))
	for _, item := range decoded.Value {
		workspaces = append(workspaces, models.AzureLogAnalyticsWorkspace{
			Name:       item.Name,
			Location:   item.Location,
			CustomerID: item.Properties.CustomerID,
		})
	}
	sort.Slice(workspaces, func(left, right int) bool {
		return strings.ToLower(workspaces[left].Name) < strings.ToLower(workspaces[right].Name)
	})
	return workspaces, nil
}

// RunLogAnalyticsQuery runs a KQL query against a workspace and returns a
// normalised column/row table. workspace is the workspace name or customer GUID.
// maxRows caps the returned row count; zero or negative values use
// DefaultLogAnalyticsMaxRows.
func (i *Inventory) RunLogAnalyticsQuery(
	ctx context.Context,
	profile models.ProfileSummary,
	workspace string,
	query string,
	timespan string,
	maxRows int,
) (models.AzureLogQueryResult, error) {
	workspace = strings.TrimSpace(workspace)
	query = strings.TrimSpace(query)
	if workspace == "" {
		return models.AzureLogQueryResult{}, fmt.Errorf("a workspace is required")
	}
	if query == "" {
		return models.AzureLogQueryResult{}, fmt.Errorf("a KQL query is required")
	}
	started := time.Now()
	ctx, cancel := context.WithTimeout(ctx, logAnalyticsQueryTimeout)
	defer cancel()
	var result models.AzureLogQueryResult
	var err error
	if isLocalFlociProfile(profile) {
		result, err = i.runLocalLogAnalyticsQuery(ctx, workspace, query, timespan)
	} else {
		args := []string{
			"monitor", "log-analytics", "query",
			"--subscription", profile.ProfileID,
			"--workspace", workspace,
			"--analytics-query", query,
			"--output", "json",
			"--only-show-errors",
		}
		if span := strings.TrimSpace(timespan); span != "" {
			// az -t accepts an ISO8601 duration (e.g. P7D) or a start/end interval.
			args = append(args, "--timespan", span)
		}
		var payload []byte
		payload, err = i.run(ctx, args...)
		if err == nil {
			result, err = parseAzCLIRows(payload)
		}
	}
	if err != nil {
		return models.AzureLogQueryResult{}, err
	}
	result.DurationMs = time.Since(started).Milliseconds()
	return applyLogAnalyticsRowCap(result, maxRows), nil
}

func applyLogAnalyticsRowCap(result models.AzureLogQueryResult, maxRows int) models.AzureLogQueryResult {
	if maxRows <= 0 {
		maxRows = DefaultLogAnalyticsMaxRows
	}
	if len(result.Rows) > maxRows {
		result.Rows = result.Rows[:maxRows]
		result.Truncated = true
	}
	return result
}

func (i *Inventory) runLocalLogAnalyticsQuery(
	ctx context.Context,
	workspace string,
	query string,
	timespan string,
) (models.AzureLogQueryResult, error) {
	url := fmt.Sprintf("%s/v1/workspaces/%s/query", i.flociBaseURL(), workspace)
	body := map[string]string{"query": query}
	if strings.TrimSpace(timespan) != "" {
		body["timespan"] = timespan
	}
	var decoded struct {
		Tables []struct {
			Columns []struct {
				Name string `json:"name"`
			} `json:"columns"`
			Rows [][]any `json:"rows"`
		} `json:"tables"`
	}
	if err := i.flociJSON(ctx, http.MethodPost, url, body, &decoded); err != nil {
		return models.AzureLogQueryResult{}, err
	}
	if len(decoded.Tables) == 0 {
		return models.AzureLogQueryResult{Columns: []string{}, Rows: [][]string{}}, nil
	}
	table := decoded.Tables[0]
	columns := make([]string, 0, len(table.Columns))
	for _, c := range table.Columns {
		columns = append(columns, c.Name)
	}
	rows := make([][]string, 0, len(table.Rows))
	for _, raw := range table.Rows {
		row := make([]string, 0, len(raw))
		for _, cell := range raw {
			row = append(row, cellToString(cell))
		}
		rows = append(rows, row)
	}
	return models.AzureLogQueryResult{Columns: columns, Rows: rows}, nil
}

// parseAzCLIRows normalises the `az monitor log-analytics query` output (a JSON
// array of row objects) into ordered columns + rows. Column order follows the
// first row's key order so the table reads as the user wrote it.
func parseAzCLIRows(payload []byte) (models.AzureLogQueryResult, error) {
	var rawRows []json.RawMessage
	if err := json.Unmarshal(payload, &rawRows); err != nil {
		return models.AzureLogQueryResult{}, fmt.Errorf("decode log analytics query result: %w", err)
	}
	if len(rawRows) == 0 {
		return models.AzureLogQueryResult{Columns: []string{}, Rows: [][]string{}}, nil
	}
	columns, err := orderedJSONKeys(rawRows[0])
	if err != nil {
		return models.AzureLogQueryResult{}, err
	}
	rows := make([][]string, 0, len(rawRows))
	for _, raw := range rawRows {
		var obj map[string]any
		if err := json.Unmarshal(raw, &obj); err != nil {
			return models.AzureLogQueryResult{}, fmt.Errorf("decode log analytics row: %w", err)
		}
		row := make([]string, 0, len(columns))
		for _, col := range columns {
			row = append(row, cellToString(obj[col]))
		}
		rows = append(rows, row)
	}
	return models.AzureLogQueryResult{Columns: columns, Rows: rows}, nil
}

// orderedJSONKeys returns an object's keys in document order.
func orderedJSONKeys(raw json.RawMessage) ([]string, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	if _, err := decoder.Token(); err != nil { // opening '{'
		return nil, fmt.Errorf("decode log analytics columns: %w", err)
	}
	var keys []string
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return nil, fmt.Errorf("decode log analytics columns: %w", err)
		}
		key, ok := token.(string)
		if !ok {
			continue
		}
		keys = append(keys, key)
		// Skip the value (handles nested objects/arrays).
		var skip json.RawMessage
		if err := decoder.Decode(&skip); err != nil {
			return nil, fmt.Errorf("decode log analytics columns: %w", err)
		}
	}
	return keys, nil
}

func cellToString(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return v
	case float64:
		return strings.TrimSuffix(strings.TrimSuffix(fmt.Sprintf("%v", v), ".0"), ".000000")
	default:
		return fmt.Sprint(v)
	}
}

// flociBaseURL is the floci-az endpoint without a trailing slash.
func (i *Inventory) flociBaseURL() string {
	endpoint := strings.TrimSpace(i.localEndpoint)
	if endpoint == "" {
		endpoint = "http://localhost:4577"
	}
	return strings.TrimRight(endpoint, "/")
}

// flociJSON performs a JSON request against floci-az. floci does not validate the
// bearer token, so a placeholder is sent purely to satisfy the API shape.
func (i *Inventory) flociJSON(ctx context.Context, method, url string, body any, out any) error {
	var reader *bytes.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(encoded)
	} else {
		reader = bytes.NewReader(nil)
	}
	request, err := http.NewRequestWithContext(ctx, method, url, reader)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer floci-local")
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return fmt.Errorf("floci-az request: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("floci-az %s %s returned HTTP %d", method, url, response.StatusCode)
	}
	if out == nil {
		return nil
	}
	if err := json.NewDecoder(response.Body).Decode(out); err != nil {
		return fmt.Errorf("decode floci-az response: %w", err)
	}
	return nil
}
