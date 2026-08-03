// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"fmt"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) dynamodbRegions(ctx context.Context, profile models.ProfileSummary) []string {
	return s.lambdaRegions(ctx, profile)
}

func (s *Service) selectedDynamoDBRegion(
	session models.SessionSnapshot,
	regions []string,
	profile models.ProfileSummary,
) string {
	if session.SelectedDynamoDBRegion != "" {
		for _, region := range regions {
			if region == session.SelectedDynamoDBRegion {
				return session.SelectedDynamoDBRegion
			}
		}
	}
	if session.SelectedLambdaRegion != "" {
		for _, region := range regions {
			if region == session.SelectedLambdaRegion {
				return session.SelectedLambdaRegion
			}
		}
	}
	return s.selectedEC2Region(session, regions, profile)
}

func (s *Service) dynamodbTables(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) []models.AwsDynamoDBTable {
	if region == "" {
		return []models.AwsDynamoDBTable{}
	}
	const scope = "aws.dynamodb.tables"
	queryHash := profile.ProfileID + "|" + region

	var cached []models.AwsDynamoDBTable
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	tables, err := s.dynamodb.ListTables(ctx, profile, region)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, tables)
		return tables
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsDynamoDBTable{}
}

func (s *Service) selectedDynamoDBTableName(
	session models.SessionSnapshot,
	tables []models.AwsDynamoDBTable,
) string {
	if session.SelectedDynamoDBTableName != "" {
		for _, table := range tables {
			if table.TableName == session.SelectedDynamoDBTableName {
				return session.SelectedDynamoDBTableName
			}
		}
	}
	if len(tables) == 0 {
		return ""
	}
	return tables[0].TableName
}

func (s *Service) enrichDynamoDBInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.dynamodb == nil {
		return
	}
	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	regions := s.dynamodbRegions(timeoutCtx, *workspace.Profile)
	cancel()
	selectedRegion := s.selectedDynamoDBRegion(session, regions, *workspace.Profile)

	if opts.lightweight {
		status := "No region is available for DynamoDB tables in this AWS workspace."
		if selectedRegion != "" {
			status = fmt.Sprintf("Loaded %d region(s). Select %s to browse tables.", len(regions), selectedRegion)
		} else if len(regions) > 0 {
			status = fmt.Sprintf("Loaded %d region(s). Select a region to browse tables.", len(regions))
		}
		lockWorkspace(mu, func() {
			workspace.DynamoDBRegions = regions
			workspace.SelectedDynamoDBRegion = selectedRegion
			workspace.DynamoDBTables = []models.AwsDynamoDBTable{}
			workspace.SelectedDynamoDBTableName = ""
			workspace.DynamoDBStatusMessage = status
		})
		return
	}

	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	tables := s.dynamodbTables(timeoutCtx, *workspace.Profile, selectedRegion)
	cancel()
	selectedTable := s.selectedDynamoDBTableName(session, tables)
	if selectedTable != "" {
		timeoutCtx, cancel := s.withAWSTimeout(context.Background())
		if full, err := s.dynamodb.DescribeTable(timeoutCtx, *workspace.Profile, selectedRegion, selectedTable); err == nil {
			for i := range tables {
				if tables[i].TableName == full.TableName {
					tables[i] = full
					break
				}
			}
		}
		cancel()
	}

	status := "No region is available for DynamoDB tables in this AWS workspace."
	if selectedRegion != "" {
		if len(tables) == 0 {
			status = fmt.Sprintf("No DynamoDB tables were returned for %s.", selectedRegion)
		} else {
			status = fmt.Sprintf("Loaded %d DynamoDB tables from %s.", len(tables), selectedRegion)
		}
	}

	lockWorkspace(mu, func() {
		workspace.DynamoDBRegions = regions
		workspace.SelectedDynamoDBRegion = selectedRegion
		workspace.DynamoDBTables = tables
		workspace.SelectedDynamoDBTableName = selectedTable
		workspace.DynamoDBStatusMessage = status
	})
}
