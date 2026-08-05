// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

const maxDynamoDBSampleItems = 25

// DynamoDBInventory provides read-only inventory for DynamoDB tables.
type DynamoDBInventory struct {
	settings config.Settings
}

func NewDynamoDBInventory(settings config.Settings) *DynamoDBInventory {
	return &DynamoDBInventory{settings: settings}
}

func (d *DynamoDBInventory) ListTables(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) ([]models.AwsDynamoDBTable, error) {
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := d.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := dynamodbClient(cfg, profile)
	paginator := dynamodb.NewListTablesPaginator(client, &dynamodb.ListTablesInput{})
	tables := []models.AwsDynamoDBTable{}
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, name := range page.TableNames {
			tables = append(tables, models.AwsDynamoDBTable{TableName: name})
		}
	}
	sort.SliceStable(tables, func(i, j int) bool {
		return tables[i].TableName < tables[j].TableName
	})
	return tables, nil
}

func (d *DynamoDBInventory) DescribeTable(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	tableName string,
) (models.AwsDynamoDBTable, error) {
	if strings.TrimSpace(tableName) == "" {
		return models.AwsDynamoDBTable{}, fmt.Errorf("table name is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := d.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsDynamoDBTable{}, err
	}

	client := dynamodbClient(cfg, profile)
	res, err := client.DescribeTable(ctx, &dynamodb.DescribeTableInput{
		TableName: aws.String(tableName),
	})
	if err != nil {
		return models.AwsDynamoDBTable{}, err
	}

	table := dynamoTableSummary(res.Table)
	page, _ := d.scanSampleItems(ctx, client, tableName, maxDynamoDBSampleItems, "")
	table.SampleItems = page.Items
	table.SampleItemsNextToken = page.SampleItemsNextToken
	table.SampleItemsHasMore = page.SampleItemsHasMore
	return table, nil
}

// ScanSampleItems returns one page of sample items for a table scan.
// exclusiveStartToken is the opaque SampleItemsNextToken from a prior page.
func (d *DynamoDBInventory) ScanSampleItems(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	tableName string,
	exclusiveStartToken string,
	limit int32,
) (models.AwsDynamoDBScanPage, error) {
	tableName = strings.TrimSpace(tableName)
	if tableName == "" {
		return models.AwsDynamoDBScanPage{}, fmt.Errorf("table name is required")
	}
	if limit <= 0 {
		limit = maxDynamoDBSampleItems
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := d.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsDynamoDBScanPage{}, err
	}
	client := dynamodbClient(cfg, profile)
	return d.scanSampleItems(ctx, client, tableName, limit, exclusiveStartToken)
}

func (d *DynamoDBInventory) scanSampleItems(
	ctx context.Context,
	client *dynamodb.Client,
	tableName string,
	limit int32,
	exclusiveStartToken string,
) (models.AwsDynamoDBScanPage, error) {
	if limit <= 0 {
		return models.AwsDynamoDBScanPage{}, nil
	}
	input := &dynamodb.ScanInput{
		TableName: aws.String(tableName),
		Limit:     aws.Int32(limit),
	}
	if strings.TrimSpace(exclusiveStartToken) != "" {
		startKey, err := decodeDynamoExclusiveStartKey(exclusiveStartToken)
		if err != nil {
			return models.AwsDynamoDBScanPage{}, fmt.Errorf("invalid scan continuation token: %w", err)
		}
		input.ExclusiveStartKey = startKey
	}
	res, err := client.Scan(ctx, input)
	if err != nil {
		return models.AwsDynamoDBScanPage{}, err
	}
	items := make([]string, 0, len(res.Items))
	for _, item := range res.Items {
		var native map[string]any
		if err := attributevalue.UnmarshalMap(item, &native); err != nil {
			continue
		}
		encoded, err := json.MarshalIndent(native, "", "  ")
		if err != nil {
			continue
		}
		items = append(items, string(encoded))
	}
	nextToken, err := encodeDynamoExclusiveStartKey(res.LastEvaluatedKey)
	if err != nil {
		return models.AwsDynamoDBScanPage{}, err
	}
	return models.AwsDynamoDBScanPage{
		Items:                items,
		SampleItemsNextToken: nextToken,
		SampleItemsHasMore:   nextToken != "",
	}, nil
}

func encodeDynamoExclusiveStartKey(key map[string]types.AttributeValue) (string, error) {
	if len(key) == 0 {
		return "", nil
	}
	var native map[string]any
	if err := attributevalue.UnmarshalMap(key, &native); err != nil {
		return "", err
	}
	raw, err := json.Marshal(native)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(raw), nil
}

func decodeDynamoExclusiveStartKey(token string) (map[string]types.AttributeValue, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, nil
	}
	raw, err := base64.StdEncoding.DecodeString(token)
	if err != nil {
		return nil, err
	}
	var native map[string]any
	if err := json.Unmarshal(raw, &native); err != nil {
		return nil, err
	}
	return attributevalue.MarshalMap(native)
}

// GetItem loads one item by key JSON object. found is false when the key misses.
func (d *DynamoDBInventory) GetItem(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	tableName string,
	keyJSON string,
) (map[string]any, bool, error) {
	tableName = strings.TrimSpace(tableName)
	keyJSON = strings.TrimSpace(keyJSON)
	if tableName == "" {
		return nil, false, fmt.Errorf("table name is required")
	}
	if keyJSON == "" {
		return nil, false, fmt.Errorf("key JSON is required")
	}
	var native map[string]any
	if err := json.Unmarshal([]byte(keyJSON), &native); err != nil {
		return nil, false, fmt.Errorf("key JSON must be a valid object: %w", err)
	}
	key, err := attributevalue.MarshalMap(native)
	if err != nil {
		return nil, false, err
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := d.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, false, err
	}
	client := dynamodbClient(cfg, profile)
	res, err := client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(tableName),
		Key:       key,
	})
	if err != nil {
		return nil, false, err
	}
	if len(res.Item) == 0 {
		return nil, false, nil
	}
	var item map[string]any
	if err := attributevalue.UnmarshalMap(res.Item, &item); err != nil {
		return nil, false, err
	}
	return item, true, nil
}

func (d *DynamoDBInventory) PutItem(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	tableName string,
	itemJSON string,
) (models.AwsDynamoDBWriteResult, error) {
	tableName = strings.TrimSpace(tableName)
	itemJSON = strings.TrimSpace(itemJSON)
	if tableName == "" {
		return models.AwsDynamoDBWriteResult{}, fmt.Errorf("table name is required")
	}
	if itemJSON == "" {
		return models.AwsDynamoDBWriteResult{}, fmt.Errorf("item JSON is required")
	}
	var native map[string]any
	if err := json.Unmarshal([]byte(itemJSON), &native); err != nil {
		return models.AwsDynamoDBWriteResult{}, fmt.Errorf("item JSON must be a valid object: %w", err)
	}
	item, err := attributevalue.MarshalMap(native)
	if err != nil {
		return models.AwsDynamoDBWriteResult{}, err
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := d.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsDynamoDBWriteResult{}, err
	}

	client := dynamodbClient(cfg, profile)
	if _, err := client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(tableName),
		Item:      item,
	}); err != nil {
		return models.AwsDynamoDBWriteResult{}, err
	}
	return models.AwsDynamoDBWriteResult{
		TableName: tableName,
		Summary:   fmt.Sprintf("Put item into table %s.", tableName),
	}, nil
}

func (d *DynamoDBInventory) DeleteItem(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	tableName string,
	keyJSON string,
) (models.AwsDynamoDBWriteResult, error) {
	tableName = strings.TrimSpace(tableName)
	keyJSON = strings.TrimSpace(keyJSON)
	if tableName == "" {
		return models.AwsDynamoDBWriteResult{}, fmt.Errorf("table name is required")
	}
	if keyJSON == "" {
		return models.AwsDynamoDBWriteResult{}, fmt.Errorf("key JSON is required")
	}
	var native map[string]any
	if err := json.Unmarshal([]byte(keyJSON), &native); err != nil {
		return models.AwsDynamoDBWriteResult{}, fmt.Errorf("key JSON must be a valid object: %w", err)
	}
	key, err := attributevalue.MarshalMap(native)
	if err != nil {
		return models.AwsDynamoDBWriteResult{}, err
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := d.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsDynamoDBWriteResult{}, err
	}

	client := dynamodbClient(cfg, profile)
	if _, err := client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(tableName),
		Key:       key,
	}); err != nil {
		return models.AwsDynamoDBWriteResult{}, err
	}
	return models.AwsDynamoDBWriteResult{
		TableName: tableName,
		Summary:   fmt.Sprintf("Deleted item from table %s.", tableName),
	}, nil
}

func (d *DynamoDBInventory) loadConfig(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) (aws.Config, error) {
	return loadAWSConfig(ctx, d.settings, profile, region)
}

func dynamodbClient(cfg aws.Config, profile models.ProfileSummary) *dynamodb.Client {
	return dynamodb.NewFromConfig(cfg, func(options *dynamodb.Options) {
		if endpointURL := awsEndpointURL(profile); endpointURL != "" {
			options.BaseEndpoint = aws.String(endpointURL)
		}
	})
}

func dynamoTableSummary(table *types.TableDescription) models.AwsDynamoDBTable {
	if table == nil {
		return models.AwsDynamoDBTable{}
	}
	summary := models.AwsDynamoDBTable{
		TableName: awsString(table.TableName),
		Status:    string(table.TableStatus),
	}
	if table.BillingModeSummary != nil && table.BillingModeSummary.BillingMode != "" {
		summary.BillingMode = string(table.BillingModeSummary.BillingMode)
	}
	if table.ItemCount != nil {
		summary.ItemCount = *table.ItemCount
	}
	if table.TableSizeBytes != nil {
		summary.TableSizeBytes = *table.TableSizeBytes
	}
	hashKey, rangeKey := keyNamesFromSchema(table.KeySchema)
	summary.HashKey = hashKey
	summary.RangeKey = rangeKey
	for _, gsi := range table.GlobalSecondaryIndexes {
		gsiHash, gsiRange := keyNamesFromSchema(gsi.KeySchema)
		summary.GlobalSecondaryIndexes = append(summary.GlobalSecondaryIndexes, models.AwsDynamoDBGlobalSecondaryIndex{
			IndexName: awsString(gsi.IndexName),
			HashKey:   gsiHash,
			RangeKey:  gsiRange,
			Status:    string(gsi.IndexStatus),
		})
	}
	sort.SliceStable(summary.GlobalSecondaryIndexes, func(i, j int) bool {
		return summary.GlobalSecondaryIndexes[i].IndexName < summary.GlobalSecondaryIndexes[j].IndexName
	})
	return summary
}

func keyNamesFromSchema(keySchema []types.KeySchemaElement) (string, string) {
	var hashKey string
	var rangeKey string
	for _, key := range keySchema {
		name := awsString(key.AttributeName)
		if key.KeyType == types.KeyTypeHash {
			hashKey = name
		}
		if key.KeyType == types.KeyTypeRange {
			rangeKey = name
		}
	}
	return hashKey, rangeKey
}
