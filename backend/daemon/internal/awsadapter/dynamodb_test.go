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

func TestDynamoExclusiveStartKeyRoundTrip(t *testing.T) {
	key := map[string]types.AttributeValue{
		"pk": &types.AttributeValueMemberS{Value: "order-1"},
		"sk": &types.AttributeValueMemberN{Value: "42"},
	}
	token, err := encodeDynamoExclusiveStartKey(key)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}
	decoded, err := decodeDynamoExclusiveStartKey(token)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(decoded) != 2 {
		t.Fatalf("decoded len = %d", len(decoded))
	}
	pk, ok := decoded["pk"].(*types.AttributeValueMemberS)
	if !ok || pk.Value != "order-1" {
		t.Fatalf("pk = %#v", decoded["pk"])
	}
	sk, ok := decoded["sk"].(*types.AttributeValueMemberN)
	if !ok || sk.Value != "42" {
		t.Fatalf("sk = %#v", decoded["sk"])
	}
}

func TestDynamoExclusiveStartKeyEmpty(t *testing.T) {
	token, err := encodeDynamoExclusiveStartKey(nil)
	if err != nil || token != "" {
		t.Fatalf("encode nil = %q err=%v", token, err)
	}
	decoded, err := decodeDynamoExclusiveStartKey("")
	if err != nil || decoded != nil {
		t.Fatalf("decode empty = %#v err=%v", decoded, err)
	}
}