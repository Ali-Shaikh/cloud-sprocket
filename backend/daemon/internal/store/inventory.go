// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

const (
	defaultResourcePageSize = 100
	maxResourcePageSize     = 500
)

// ReplaceInventory atomically records a completed inventory run, marks older
// records in its scope stale, and upserts everything observed by the run.
func (s *Store) ReplaceInventory(
	ctx context.Context,
	run models.InventoryRun,
	resources []models.ResourceRecord,
	edges []models.ResourceEdge,
) error {
	transaction, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer transaction.Rollback()

	if _, err := transaction.ExecContext(
		ctx,
		`INSERT INTO inventory_runs (
			run_id, scope_id, provider, profile_id, started_at, completed_at,
			status, resource_count, edge_count, error_message
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		run.RunID,
		run.ScopeID,
		run.Provider,
		run.ProfileID,
		run.StartedAt,
		run.CompletedAt,
		run.Status,
		len(resources),
		len(edges),
		run.ErrorMessage,
	); err != nil {
		return fmt.Errorf("insert inventory run: %w", err)
	}

	if _, err := transaction.ExecContext(
		ctx,
		`UPDATE resources SET stale = 1 WHERE scope_id = ?`,
		run.ScopeID,
	); err != nil {
		return fmt.Errorf("mark previous inventory stale: %w", err)
	}

	for _, resource := range resources {
		if resource.ScopeID != run.ScopeID {
			return fmt.Errorf("resource %s belongs to scope %s, expected %s", resource.ID, resource.ScopeID, run.ScopeID)
		}
		tags, err := json.Marshal(nonNilMap(resource.Tags))
		if err != nil {
			return fmt.Errorf("marshal tags for %s: %w", resource.ID, err)
		}
		attributes, err := json.Marshal(nonNilMap(resource.Attributes))
		if err != nil {
			return fmt.Errorf("marshal attributes for %s: %w", resource.ID, err)
		}
		if _, err := transaction.ExecContext(
			ctx,
			`INSERT INTO resources (
				scope_id, resource_id, provider, account_id, region, service,
				resource_type, name, status, tags_json, attributes_json,
				source_ref, inventory_run_id, last_seen_at, stale
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
			ON CONFLICT(scope_id, resource_id) DO UPDATE SET
				provider = excluded.provider,
				account_id = excluded.account_id,
				region = excluded.region,
				service = excluded.service,
				resource_type = excluded.resource_type,
				name = excluded.name,
				status = excluded.status,
				tags_json = excluded.tags_json,
				attributes_json = excluded.attributes_json,
				source_ref = excluded.source_ref,
				inventory_run_id = excluded.inventory_run_id,
				last_seen_at = excluded.last_seen_at,
				stale = 0`,
			resource.ScopeID,
			resource.ID,
			resource.Provider,
			resource.AccountID,
			resource.Region,
			resource.Service,
			resource.Type,
			resource.Name,
			resource.Status,
			string(tags),
			string(attributes),
			resource.SourceRef,
			run.RunID,
			resource.LastSeenAt,
		); err != nil {
			return fmt.Errorf("upsert resource %s: %w", resource.ID, err)
		}
	}

	if _, err := transaction.ExecContext(ctx, `DELETE FROM resource_edges WHERE scope_id = ?`, run.ScopeID); err != nil {
		return fmt.Errorf("replace resource edges: %w", err)
	}
	for _, edge := range edges {
		if edge.ScopeID != run.ScopeID {
			return fmt.Errorf("resource edge belongs to scope %s, expected %s", edge.ScopeID, run.ScopeID)
		}
		if _, err := transaction.ExecContext(
			ctx,
			`INSERT INTO resource_edges (
				scope_id, source_id, target_id, kind, confidence, evidence,
				inventory_run_id, last_seen_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			edge.ScopeID,
			edge.SourceID,
			edge.TargetID,
			edge.Kind,
			edge.Confidence,
			edge.Evidence,
			run.RunID,
			edge.LastSeenAt,
		); err != nil {
			return fmt.Errorf("insert resource edge %s -> %s: %w", edge.SourceID, edge.TargetID, err)
		}
	}

	return transaction.Commit()
}

func (s *Store) ListResources(ctx context.Context, filter models.ResourceListFilter) (models.ResourceListResult, error) {
	filter.Limit = normaliseResourceLimit(filter.Limit)
	if filter.Offset < 0 {
		filter.Offset = 0
	}

	where, arguments := resourceWhere(filter)
	var total int
	if err := s.db.QueryRowContext(
		ctx,
		`SELECT COUNT(*) FROM resources`+where,
		arguments...,
	).Scan(&total); err != nil {
		return models.ResourceListResult{}, err
	}

	queryArguments := append(append([]any{}, arguments...), filter.Limit, filter.Offset)
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT scope_id, resource_id, provider, account_id, region, service,
			resource_type, name, status, tags_json, attributes_json, source_ref,
			inventory_run_id, last_seen_at, stale
		 FROM resources`+where+`
		 ORDER BY provider, service, name, resource_id
		 LIMIT ? OFFSET ?`,
		queryArguments...,
	)
	if err != nil {
		return models.ResourceListResult{}, err
	}
	defer rows.Close()

	resources := []models.ResourceRecord{}
	for rows.Next() {
		resource, err := scanResource(rows)
		if err != nil {
			return models.ResourceListResult{}, err
		}
		resources = append(resources, resource)
	}
	if err := rows.Err(); err != nil {
		return models.ResourceListResult{}, err
	}

	result := models.ResourceListResult{
		Resources: resources,
		Total:     total,
		Limit:     filter.Limit,
		Offset:    filter.Offset,
	}
	if next := filter.Offset + len(resources); next < total {
		result.NextOffset = &next
	}
	return result, nil
}

func (s *Store) GetResource(ctx context.Context, scopeID string, resourceID string) (models.ResourceRecord, bool, error) {
	row := s.db.QueryRowContext(
		ctx,
		`SELECT scope_id, resource_id, provider, account_id, region, service,
			resource_type, name, status, tags_json, attributes_json, source_ref,
			inventory_run_id, last_seen_at, stale
		 FROM resources WHERE scope_id = ? AND resource_id = ?`,
		scopeID,
		resourceID,
	)
	resource, err := scanResource(row)
	if err == sql.ErrNoRows {
		return models.ResourceRecord{}, false, nil
	}
	return resource, err == nil, err
}

func (s *Store) ListLatestInventoryRuns(ctx context.Context) ([]models.InventoryRun, error) {
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT run_id, scope_id, provider, profile_id, started_at, completed_at,
			status, resource_count, edge_count, error_message
		 FROM inventory_runs AS current
		 WHERE run_id = (
			SELECT previous.run_id
			FROM inventory_runs AS previous
			WHERE previous.scope_id = current.scope_id
			ORDER BY previous.started_at DESC, previous.rowid DESC
			LIMIT 1
		 )
		 ORDER BY provider, profile_id, run_id`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	runs := []models.InventoryRun{}
	for rows.Next() {
		var run models.InventoryRun
		if err := rows.Scan(
			&run.RunID,
			&run.ScopeID,
			&run.Provider,
			&run.ProfileID,
			&run.StartedAt,
			&run.CompletedAt,
			&run.Status,
			&run.ResourceCount,
			&run.EdgeCount,
			&run.ErrorMessage,
		); err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}
	return runs, rows.Err()
}

func (s *Store) GetCloudOverview(ctx context.Context) (models.CloudOverview, error) {
	overview := models.CloudOverview{
		Providers: []models.OverviewDimension{},
		Services:  []models.OverviewDimension{},
		Regions:   []models.OverviewDimension{},
	}
	if err := s.db.QueryRowContext(
		ctx,
		`SELECT
			COALESCE(SUM(CASE WHEN stale = 0 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN stale = 1 THEN 1 ELSE 0 END), 0),
			COUNT(DISTINCT CASE WHEN stale = 0 THEN scope_id END)
		 FROM resources`,
	).Scan(&overview.ResourceCount, &overview.StaleResourceCount, &overview.WorkspaceCount); err != nil {
		return models.CloudOverview{}, err
	}

	var err error
	if overview.Providers, err = s.listOverviewDimensions(
		ctx,
		`SELECT provider, COUNT(*) FROM resources WHERE stale = 0 GROUP BY provider ORDER BY COUNT(*) DESC, provider`,
	); err != nil {
		return models.CloudOverview{}, err
	}
	if overview.Services, err = s.listOverviewDimensions(
		ctx,
		`SELECT service, COUNT(*) FROM resources WHERE stale = 0 GROUP BY service ORDER BY COUNT(*) DESC, service`,
	); err != nil {
		return models.CloudOverview{}, err
	}
	if overview.Regions, err = s.listOverviewDimensions(
		ctx,
		`SELECT COALESCE(NULLIF(region, ''), 'global'), COUNT(*)
		 FROM resources WHERE stale = 0
		 GROUP BY COALESCE(NULLIF(region, ''), 'global')
		 ORDER BY COUNT(*) DESC, COALESCE(NULLIF(region, ''), 'global')`,
	); err != nil {
		return models.CloudOverview{}, err
	}
	overview.InventoryRuns, err = s.ListLatestInventoryRuns(ctx)
	if err != nil {
		return models.CloudOverview{}, err
	}
	return overview, nil
}

func (s *Store) listOverviewDimensions(ctx context.Context, query string) ([]models.OverviewDimension, error) {
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	dimensions := []models.OverviewDimension{}
	for rows.Next() {
		var dimension models.OverviewDimension
		if err := rows.Scan(&dimension.Key, &dimension.Count); err != nil {
			return nil, err
		}
		dimensions = append(dimensions, dimension)
	}
	return dimensions, rows.Err()
}

type resourceScanner interface {
	Scan(dest ...any) error
}

func scanResource(scanner resourceScanner) (models.ResourceRecord, error) {
	var resource models.ResourceRecord
	var tagsJSON string
	var attributesJSON string
	var stale int
	if err := scanner.Scan(
		&resource.ScopeID,
		&resource.ID,
		&resource.Provider,
		&resource.AccountID,
		&resource.Region,
		&resource.Service,
		&resource.Type,
		&resource.Name,
		&resource.Status,
		&tagsJSON,
		&attributesJSON,
		&resource.SourceRef,
		&resource.InventoryID,
		&resource.LastSeenAt,
		&stale,
	); err != nil {
		return models.ResourceRecord{}, err
	}
	if err := json.Unmarshal([]byte(tagsJSON), &resource.Tags); err != nil {
		return models.ResourceRecord{}, err
	}
	if err := json.Unmarshal([]byte(attributesJSON), &resource.Attributes); err != nil {
		return models.ResourceRecord{}, err
	}
	resource.Stale = stale != 0
	return resource, nil
}

func resourceWhere(filter models.ResourceListFilter) (string, []any) {
	clauses := []string{}
	arguments := []any{}
	add := func(clause string, value any) {
		clauses = append(clauses, clause)
		arguments = append(arguments, value)
	}
	if filter.ScopeID != "" {
		add("scope_id = ?", filter.ScopeID)
	}
	if filter.Provider != "" {
		add("provider = ?", filter.Provider)
	}
	if filter.Service != "" {
		add("service = ?", filter.Service)
	}
	if filter.Type != "" {
		add("resource_type = ?", filter.Type)
	}
	if filter.Status != "" {
		add("status = ?", filter.Status)
	}
	if !filter.IncludeStale {
		clauses = append(clauses, "stale = 0")
	}
	if query := strings.TrimSpace(filter.Query); query != "" {
		like := "%" + strings.ToLower(query) + "%"
		clauses = append(clauses, "(LOWER(name) LIKE ? OR LOWER(resource_id) LIKE ? OR LOWER(tags_json) LIKE ?)")
		arguments = append(arguments, like, like, like)
	}
	if len(clauses) == 0 {
		return "", arguments
	}
	return " WHERE " + strings.Join(clauses, " AND "), arguments
}

func normaliseResourceLimit(limit int) int {
	if limit <= 0 {
		return defaultResourcePageSize
	}
	if limit > maxResourcePageSize {
		return maxResourcePageSize
	}
	return limit
}

func nonNilMap(value map[string]string) map[string]string {
	if value == nil {
		return map[string]string{}
	}
	return value
}
