// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

const (
	wafSchemaModeDiagnostics       = "azureDiagnostics"
	wafSchemaModeResourceSpecific  = "resourceSpecific"
	wafDiagnosticsTable            = "AzureDiagnostics"
	wafDiagnosticsCategoryStandard = "FrontDoorWebApplicationFirewallLog"
	wafDiagnosticsCategoryClassic  = "FrontdoorWebApplicationFirewallLog"
)

// Front Door Standard/Premium resource-specific WAF table. Classic-cased Category
// values are diagnostics-only and are not probed here.
var wafResourceSpecificTables = []string{
	wafDiagnosticsCategoryStandard,
}

// DetectWafLogSchema probes a workspace to learn where Front Door WAF logs live and
// which column names to use when generating KQL.
func (i *Inventory) DetectWafLogSchema(
	ctx context.Context,
	profile models.ProfileSummary,
	workspace string,
	timespan string,
) (models.AzureWafLogSchemaProfile, error) {
	if strings.TrimSpace(workspace) == "" {
		return models.AzureWafLogSchemaProfile{}, fmt.Errorf("a workspace is required")
	}
	if strings.TrimSpace(timespan) == "" {
		timespan = "P1D"
	}

	diagnosticsQuery := fmt.Sprintf(
		`%s | where Category in ("%s","%s") | take 1`,
		wafDiagnosticsTable,
		wafDiagnosticsCategoryStandard,
		wafDiagnosticsCategoryClassic,
	)
	diagnosticsResult, err := i.RunLogAnalyticsQuery(ctx, profile, workspace, diagnosticsQuery, timespan, 1)
	if err == nil && len(diagnosticsResult.Rows) > 0 {
		schema := diagnosticsSchemaProfile(diagnosticsResult.Columns)
		schema.Detected = true
		schema.Message = "WAF logs detected in AzureDiagnostics."
		return schema, nil
	}

	for _, tableName := range wafResourceSpecificTables {
		query := fmt.Sprintf("%s | take 1", tableName)
		result, queryErr := i.RunLogAnalyticsQuery(ctx, profile, workspace, query, timespan, 1)
		if queryErr == nil && len(result.Rows) > 0 {
			schema := resourceSpecificSchemaProfile(tableName, result.Columns)
			schema.Detected = true
			schema.Message = fmt.Sprintf("WAF logs detected in resource-specific table %s.", tableName)
			return schema, nil
		}
	}

	schema := diagnosticsSchemaProfile(nil)
	schema.Detected = false
	schema.Message = "No WAF log rows found in the last day. Diagnostics schema assumed; enable Front Door WAF logging or widen the time range."
	return schema, nil
}

func diagnosticsSchemaProfile(columns []string) models.AzureWafLogSchemaProfile {
	columnMap := models.AzureWafLogColumnMap{
		TimeGenerated:     pickColumn(columns, "TimeGenerated"),
		Category:          pickColumn(columns, "Category"),
		Action:            pickColumn(columns, "action_s", "Action"),
		RuleName:          pickColumn(columns, "ruleName_s", "RuleName"),
		RequestUri:        pickColumn(columns, "requestUri_s", "RequestUri"),
		ClientIP:          pickColumn(columns, "clientIP_s", "clientIp_s", "ClientIP"),
		Host:              pickColumn(columns, "host_s", "hostName_s", "Host"),
		PolicyName:        pickColumn(columns, "policy_s", "PolicyName", "Policy"),
		PolicyMode:        pickColumn(columns, "policyMode_s", "PolicyMode"),
		TrackingReference: pickColumn(columns, "trackingReference_s", "TrackingReference"),
		DetailsMatches:    pickColumn(columns, "details_matches_s"),
		DetailsMessage:    pickColumn(columns, "details_msg_s"),
		DetailsData:       pickColumn(columns, "details_data_s"),
		AdditionalFields:  pickColumn(columns, "AdditionalFields"),
	}
	return models.AzureWafLogSchemaProfile{
		Mode:      wafSchemaModeDiagnostics,
		TableName: wafDiagnosticsTable,
		Categories: []string{
			wafDiagnosticsCategoryStandard,
			wafDiagnosticsCategoryClassic,
		},
		Columns: columnMap,
	}
}

func resourceSpecificSchemaProfile(tableName string, columns []string) models.AzureWafLogSchemaProfile {
	columnMap := models.AzureWafLogColumnMap{
		TimeGenerated:     pickColumn(columns, "TimeGenerated"),
		Action:            pickColumn(columns, "Action", "action_s"),
		RuleName:          pickColumn(columns, "RuleName", "ruleName_s"),
		RequestUri:        pickColumn(columns, "RequestUri", "requestUri_s"),
		ClientIP:          pickColumn(columns, "ClientIP", "clientIP_s"),
		Host:              pickColumn(columns, "Host", "host_s"),
		PolicyName:        pickColumn(columns, "PolicyName", "policy_s", "Policy"),
		PolicyMode:        pickColumn(columns, "PolicyMode", "policyMode_s"),
		TrackingReference: pickColumn(columns, "TrackingReference", "trackingReference_s"),
		DetailsMatches:    pickColumn(columns, "Details", "details_matches_s"),
		DetailsMessage:    pickColumn(columns, "details_msg_s"),
		DetailsData:       pickColumn(columns, "details_data_s"),
		AdditionalFields:  pickColumn(columns, "AdditionalFields"),
	}
	return models.AzureWafLogSchemaProfile{
		Mode:      wafSchemaModeResourceSpecific,
		TableName: tableName,
		Columns:   columnMap,
	}
}

func pickColumn(columns []string, candidates ...string) string {
	if len(columns) == 0 {
		if len(candidates) > 0 {
			return candidates[0]
		}
		return ""
	}
	lookup := make(map[string]struct{}, len(columns))
	for _, column := range columns {
		lookup[strings.ToLower(column)] = struct{}{}
	}
	for _, candidate := range candidates {
		if _, ok := lookup[strings.ToLower(candidate)]; ok {
			return candidate
		}
	}
	if len(candidates) > 0 {
		return candidates[0]
	}
	return ""
}