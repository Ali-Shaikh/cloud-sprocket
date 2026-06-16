package app

import (
	"context"
	"encoding/json"
	"fmt"

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
	tables, err := s.dynamodb.ListTables(ctx, profile, region)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, tables, s.timestamp())
		return tables
	}
	var cached []models.AwsDynamoDBTable
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

func (s *Service) handleAwsDynamodbSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a DynamoDB region", func(session *models.SessionSnapshot) error {
		session.SelectedDynamoDBRegion = request.Region
		session.SelectedDynamoDBTableName = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspace(ctx, snapshot, session, notifier, "info", fmt.Sprintf("Selected DynamoDB region %s.", request.Region), true)
}

func (s *Service) handleAwsDynamodbSelectTable(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		TableName string `json:"tableName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a DynamoDB table", func(session *models.SessionSnapshot) error {
		session.SelectedDynamoDBTableName = request.TableName
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspace(ctx, snapshot, session, notifier, "", "", false)
}
