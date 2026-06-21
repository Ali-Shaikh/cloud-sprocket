// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

func TestDynamoTableSummaryMapsKeysAndGSIs(t *testing.T) {
	table := &types.TableDescription{
		TableName: aws.String("app-data"),
		TableStatus: types.TableStatusActive,
		ItemCount: aws.Int64(42),
		TableSizeBytes: aws.Int64(8192),
		BillingModeSummary: &types.BillingModeSummary{
			BillingMode: types.BillingModePayPerRequest,
		},
		AttributeDefinitions: []types.AttributeDefinition{
			{AttributeName: aws.String("pk"), AttributeType: types.ScalarAttributeTypeS},
			{AttributeName: aws.String("sk"), AttributeType: types.ScalarAttributeTypeS},
			{AttributeName: aws.String("gsi_pk"), AttributeType: types.ScalarAttributeTypeS},
		},
		KeySchema: []types.KeySchemaElement{
			{AttributeName: aws.String("pk"), KeyType: types.KeyTypeHash},
			{AttributeName: aws.String("sk"), KeyType: types.KeyTypeRange},
		},
		GlobalSecondaryIndexes: []types.GlobalSecondaryIndexDescription{
			{
				IndexName: aws.String("by-status"),
				IndexStatus: types.IndexStatusActive,
				KeySchema: []types.KeySchemaElement{
					{AttributeName: aws.String("gsi_pk"), KeyType: types.KeyTypeHash},
				},
			},
		},
	}

	got := dynamoTableSummary(table)
	if got.TableName != "app-data" {
		t.Fatalf("TableName = %q", got.TableName)
	}
	if got.HashKey != "pk" || got.RangeKey != "sk" {
		t.Fatalf("keys = %q / %q", got.HashKey, got.RangeKey)
	}
	if got.ItemCount != 42 || got.TableSizeBytes != 8192 {
		t.Fatalf("counts = %d / %d", got.ItemCount, got.TableSizeBytes)
	}
	if got.BillingMode != string(types.BillingModePayPerRequest) {
		t.Fatalf("BillingMode = %q", got.BillingMode)
	}
	if len(got.GlobalSecondaryIndexes) != 1 || got.GlobalSecondaryIndexes[0].IndexName != "by-status" {
		t.Fatalf("GSIs = %+v", got.GlobalSecondaryIndexes)
	}
}

func TestDynamoTableSummaryNilTable(t *testing.T) {
	got := dynamoTableSummary(nil)
	if got.TableName != "" {
		t.Fatalf("expected empty summary, got %+v", got)
	}
}