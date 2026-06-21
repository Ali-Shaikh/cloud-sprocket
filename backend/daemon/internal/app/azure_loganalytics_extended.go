package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"cloudsprocket/backend/daemon/internal/models"
)

const (
	logAnalyticsHistorySettingPrefix = "azure.log-analytics.history"
	logAnalyticsSavedSettingPrefix   = "azure.log-analytics.saved"
	logAnalyticsHistoryLimit         = 50
)

func logAnalyticsSettingKey(prefix, workspace string) string {
	return fmt.Sprintf("%s.%s", prefix, strings.TrimSpace(workspace))
}

func (s *Service) appendLogAnalyticsHistory(ctx context.Context, workspace string, query string, timespan string) {
	workspace = strings.TrimSpace(workspace)
	query = strings.TrimSpace(query)
	if workspace == "" || query == "" {
		return
	}
	key := logAnalyticsSettingKey(logAnalyticsHistorySettingPrefix, workspace)
	var history []models.AzureLogAnalyticsHistoryEntry
	_, _ = s.store.LoadAppSetting(ctx, key, &history)
	entry := models.AzureLogAnalyticsHistoryEntry{
		Query:    query,
		Timespan: strings.TrimSpace(timespan),
		RanAt:    s.timestamp(),
	}
	updated := []models.AzureLogAnalyticsHistoryEntry{entry}
	for _, existing := range history {
		if existing.Query == entry.Query && existing.Timespan == entry.Timespan {
			continue
		}
		updated = append(updated, existing)
		if len(updated) >= logAnalyticsHistoryLimit {
			break
		}
	}
	_ = s.store.SaveAppSetting(ctx, key, updated)
}

func (s *Service) handleAzureLogAnalyticsHistoryList(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
	var request struct {
		Workspace string `json:"workspace"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	workspace := strings.TrimSpace(request.Workspace)
	if workspace == "" {
		return nil, errors.New("a workspace is required")
	}
	key := logAnalyticsSettingKey(logAnalyticsHistorySettingPrefix, workspace)
	var history []models.AzureLogAnalyticsHistoryEntry
	if ok, err := s.store.LoadAppSetting(ctx, key, &history); err != nil {
		return nil, err
	} else if !ok {
		history = []models.AzureLogAnalyticsHistoryEntry{}
	}
	return history, nil
}

func (s *Service) handleAzureLogAnalyticsSavedList(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
	var request struct {
		Workspace string `json:"workspace"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	workspace := strings.TrimSpace(request.Workspace)
	if workspace == "" {
		return nil, errors.New("a workspace is required")
	}
	key := logAnalyticsSettingKey(logAnalyticsSavedSettingPrefix, workspace)
	var saved []models.AzureLogAnalyticsSavedQuery
	if ok, err := s.store.LoadAppSetting(ctx, key, &saved); err != nil {
		return nil, err
	} else if !ok {
		saved = []models.AzureLogAnalyticsSavedQuery{}
	}
	return saved, nil
}

func (s *Service) handleAzureLogAnalyticsSavedSave(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
	var request struct {
		Workspace string `json:"workspace"`
		ID        string `json:"id"`
		Name      string `json:"name"`
		Query     string `json:"query"`
		Timespan  string `json:"timespan"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	workspace := strings.TrimSpace(request.Workspace)
	name := strings.TrimSpace(request.Name)
	query := strings.TrimSpace(request.Query)
	if workspace == "" || name == "" || query == "" {
		return nil, errors.New("a workspace, name, and query are required")
	}
	key := logAnalyticsSettingKey(logAnalyticsSavedSettingPrefix, workspace)
	var saved []models.AzureLogAnalyticsSavedQuery
	_, _ = s.store.LoadAppSetting(ctx, key, &saved)
	id := strings.TrimSpace(request.ID)
	if id == "" {
		id = fmt.Sprintf("saved-%d", time.Now().UnixNano())
	}
	replacement := models.AzureLogAnalyticsSavedQuery{
		ID:       id,
		Name:     name,
		Query:    query,
		Timespan: strings.TrimSpace(request.Timespan),
	}
	updated := make([]models.AzureLogAnalyticsSavedQuery, 0, len(saved)+1)
	replaced := false
	for _, item := range saved {
		if item.ID == id {
			updated = append(updated, replacement)
			replaced = true
			continue
		}
		updated = append(updated, item)
	}
	if !replaced {
		updated = append(updated, replacement)
	}
	if err := s.store.SaveAppSetting(ctx, key, updated); err != nil {
		return nil, err
	}
	return replacement, nil
}

func (s *Service) handleAzureLogAnalyticsSavedDelete(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
	var request struct {
		Workspace string `json:"workspace"`
		ID        string `json:"id"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	workspace := strings.TrimSpace(request.Workspace)
	id := strings.TrimSpace(request.ID)
	if workspace == "" || id == "" {
		return nil, errors.New("a workspace and saved query id are required")
	}
	key := logAnalyticsSettingKey(logAnalyticsSavedSettingPrefix, workspace)
	var saved []models.AzureLogAnalyticsSavedQuery
	_, _ = s.store.LoadAppSetting(ctx, key, &saved)
	updated := make([]models.AzureLogAnalyticsSavedQuery, 0, len(saved))
	for _, item := range saved {
		if item.ID != id {
			updated = append(updated, item)
		}
	}
	if err := s.store.SaveAppSetting(ctx, key, updated); err != nil {
		return nil, err
	}
	return map[string]bool{"deleted": true}, nil
}

func (s *Service) handleAzureLogAnalyticsTablesList(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
	var request struct {
		Workspace      string `json:"workspace"`
		IncludeColumns bool   `json:"includeColumns"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	profile, session, err := s.lockedAzureProfile(ctx)
	if err != nil {
		return nil, err
	}
	workspaces := s.azureLogAnalyticsWorkspaces(ctx, profile)
	workspaceName := strings.TrimSpace(request.Workspace)
	if workspaceName == "" {
		workspaceName = s.selectedAzureLogWorkspace(session, workspaces)
	}
	resourceGroup := ""
	for _, workspace := range workspaces {
		if workspace.Name == workspaceName || workspace.CustomerID == workspaceName {
			resourceGroup = workspace.ResourceGroup
			break
		}
	}
	return s.azure.ListLogAnalyticsTables(ctx, profile, workspaceName, resourceGroup, request.IncludeColumns)
}