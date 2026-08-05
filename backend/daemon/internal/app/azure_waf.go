// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) enrichAzureWafInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts azureEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "azure" ||
		workspace.Profile == nil ||
		s.azure == nil {
		return
	}
	ctx, cancel := s.withAzureTimeout(context.Background())
	defer cancel()
	profile := *workspace.Profile

	workspaces := workspace.AzureLogAnalyticsWorkspaces
	if len(workspaces) == 0 {
		workspaces = s.azureLogAnalyticsWorkspaces(ctx, profile)
	}
	selectedWorkspace := s.selectedAzureLogWorkspace(session, workspaces)
	if selectedWorkspace == "" && len(workspaces) > 0 {
		selectedWorkspace = workspaces[0].Name
	}
	queryWorkspace := selectedWorkspace
	if selectedWorkspace != "" {
		if resolvedID, err := azureLogAnalyticsQueryWorkspace(selectedWorkspace, workspaces, !isLocalFlociProfile(profile)); err == nil {
			queryWorkspace = resolvedID
		}
	}

	var schema *models.AzureWafLogSchemaProfile
	if !opts.lightweight && queryWorkspace != "" {
		if detected, err := s.azure.DetectWafLogSchema(ctx, profile, queryWorkspace, "P1D"); err == nil {
			schema = &detected
		}
	}

	if isLocalFlociProfile(profile) {
		lockWorkspace(mu, func() {
			workspace.AzureWafStatusMessage = "WAF policy config is cloud-only. Local KQL may still surface WAF rows when logging is configured."
			workspace.AzureWafPolicies = []models.AzureWafPolicySummary{}
		})
		return
	}

	policies, err := s.azure.ListWafPolicies(ctx, profile, !opts.lightweight)
	if err != nil {
		lockWorkspace(mu, func() {
			workspace.AzureWafStatusMessage = friendlyAzureError(err)
			workspace.AzureWafPolicies = []models.AzureWafPolicySummary{}
		})
		return
	}

	selected := strings.TrimSpace(session.SelectedAzureWafPolicy)
	if selected != "" {
		found := false
		for _, policy := range policies {
			if policy.Name == selected {
				found = true
				break
			}
		}
		if !found {
			selected = ""
		}
	}
	if selected == "" && len(policies) > 0 {
		selected = policies[0].Name
	}
	status := fmt.Sprintf("Loaded %d Front Door WAF polic%s.", len(policies), pluralSuffix(len(policies), "y", "ies"))

	var (
		detail     *models.AzureWafPolicyDetail
		fireCounts []models.AzureWafRuleFireCount
	)
	if !opts.lightweight && selected != "" {
		resourceGroup := ""
		for _, policy := range policies {
			if policy.Name == selected {
				resourceGroup = policy.ResourceGroup
				break
			}
		}
		if resourceGroup != "" {
			if policyDetail, detailErr := s.azure.GetWafPolicy(ctx, profile, resourceGroup, selected); detailErr == nil {
				detail = &policyDetail
				fireCounts = s.wafRuleFireCounts(ctx, profile, queryWorkspace, schema, policyDetail.Name)
			}
		}
	}

	lockWorkspace(mu, func() {
		if schema != nil {
			workspace.AzureWafLogSchema = schema
		} else if opts.lightweight {
			workspace.AzureWafLogSchema = nil
		}
		workspace.AzureLogAnalyticsWorkspaces = workspaces
		if selectedWorkspace != "" {
			workspace.SelectedAzureLogWorkspace = selectedWorkspace
		}
		workspace.AzureWafPolicies = policies
		workspace.AzureWafStatusMessage = status
		workspace.SelectedAzureWafPolicy = selected
		if detail != nil {
			workspace.AzureWafPolicyDetail = detail
			workspace.AzureWafRuleFireCounts = fireCounts
		} else if opts.lightweight {
			workspace.AzureWafPolicyDetail = nil
			workspace.AzureWafRuleFireCounts = nil
		}
	})
}

func (s *Service) wafRuleFireCounts(
	ctx context.Context,
	profile models.ProfileSummary,
	workspaceID string,
	schema *models.AzureWafLogSchemaProfile,
	policyName string,
) []models.AzureWafRuleFireCount {
	if schema == nil || workspaceID == "" || strings.TrimSpace(policyName) == "" {
		return []models.AzureWafRuleFireCount{}
	}
	query := buildWafTopRulesQuery(*schema, policyName)
	result, err := s.azure.RunLogAnalyticsQuery(ctx, profile, workspaceID, query, "P1D", 50)
	if err != nil || len(result.Rows) == 0 {
		return []models.AzureWafRuleFireCount{}
	}
	ruleIndex := indexResultColumn(result.Columns, schema.Columns.RuleName)
	actionIndex := indexResultColumn(result.Columns, schema.Columns.Action)
	countIndex := indexResultColumn(result.Columns, "Count")
	if ruleIndex < 0 {
		ruleIndex = 0
	}
	if countIndex < 0 {
		countIndex = len(result.Columns) - 1
	}
	counts := make([]models.AzureWafRuleFireCount, 0, len(result.Rows))
	for _, row := range result.Rows {
		count := 0
		if countIndex >= 0 && countIndex < len(row) {
			fmt.Sscanf(row[countIndex], "%d", &count)
		}
		ruleName := ""
		if ruleIndex >= 0 && ruleIndex < len(row) {
			ruleName = row[ruleIndex]
		}
		action := ""
		if actionIndex >= 0 && actionIndex < len(row) {
			action = row[actionIndex]
		}
		if ruleName == "" {
			continue
		}
		counts = append(counts, models.AzureWafRuleFireCount{
			RuleName: ruleName,
			Count:    count,
			Action:   action,
		})
	}
	return counts
}

func buildWafTopRulesQuery(schema models.AzureWafLogSchemaProfile, policyName string) string {
	table := schema.TableName
	ruleColumn := schema.Columns.RuleName
	policyColumn := schema.Columns.PolicyName
	if schema.Mode == "azureDiagnostics" {
		return fmt.Sprintf(
			`%s | where Category in ("%s") | where %s == "%s" | summarize Count=count() by %s, %s | top 20 by Count desc`,
			table,
			strings.Join(schema.Categories, `","`),
			policyColumn,
			escapeKQLString(policyName),
			ruleColumn,
			schema.Columns.Action,
		)
	}
	return fmt.Sprintf(
		`%s | where %s == "%s" | summarize Count=count() by %s, %s | top 20 by Count desc`,
		table,
		policyColumn,
		escapeKQLString(policyName),
		ruleColumn,
		schema.Columns.Action,
	)
}

func escapeKQLString(value string) string {
	// Escape backslashes first (so an existing backslash is not doubled by the
	// quote pass), then double-quotes. Mirrors the frontend escapeKql helper.
	value = strings.ReplaceAll(value, `\`, `\\`)
	return strings.ReplaceAll(value, `"`, `\"`)
}

func indexResultColumn(columns []string, name string) int {
	for index, column := range columns {
		if strings.EqualFold(column, name) {
			return index
		}
	}
	return -1
}

func pluralSuffix(count int, singular, plural string) string {
	if count == 1 {
		return singular
	}
	return plural
}

func friendlyAzureError(err error) string {
	if err == nil {
		return ""
	}
	message := err.Error()
	switch {
	case strings.Contains(message, "SemanticError"),
		strings.Contains(message, "BadArgumentError"):
		return "The KQL query was rejected by Azure Monitor. Check the generated query and try a narrower time range."
	case strings.Contains(message, "AADSTS"):
		return "Azure sign-in failed. Re-authenticate the profile in the Azure CLI, then retry."
	case strings.Contains(message, "table"), strings.Contains(message, "Table"):
		return "The requested log table was not found in this workspace. Check diagnostic settings and schema detection."
	default:
		return message
	}
}

func (s *Service) handleAzureWafLogsSchema(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
	var request struct {
		Workspace string `json:"workspace"`
		Timespan  string `json:"timespan"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	profile, session, err := s.lockedAzureProfile(ctx)
	if err != nil {
		return nil, err
	}
	workspaces := s.azureLogAnalyticsWorkspaces(ctx, profile)
	workspace := strings.TrimSpace(request.Workspace)
	if workspace == "" {
		workspace = s.selectedAzureLogWorkspace(session, workspaces)
	}
	workspace, err = azureLogAnalyticsQueryWorkspace(workspace, workspaces, !isLocalFlociProfile(profile))
	if err != nil {
		return nil, err
	}
	return s.azure.DetectWafLogSchema(ctx, profile, workspace, request.Timespan)
}

func (s *Service) handleAzureWafRefresh(ctx context.Context, _ json.RawMessage, notifier Notifier) (any, error) {
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before refreshing WAF policy config", nil)
	if err != nil {
		return nil, err
	}
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		skipAwsInventory: true,
		azureScope:       "waf",
	}, "", "")
}
