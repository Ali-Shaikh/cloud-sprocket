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
		TableName:      aws.String("app-data"),
		TableStatus:    types.TableStatusActive,
		ItemCount:      aws.Int64(42),
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
				IndexName:   aws.String("by-status"),
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

func TestParseDynamoScalar(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name    string
		in      string
		wantN   string
		wantS   string
		wantErr bool
	}{
		{name: "empty", in: "", wantErr: true},
		{name: "whitespace", in: "   ", wantErr: true},
		{name: "integer", in: "42", wantN: "42"},
		{name: "trimmed number", in: "  3.14  ", wantN: "3.14"},
		{name: "negative", in: "-7", wantN: "-7"},
		{name: "scientific", in: "1e10", wantN: "1e10"},
		{name: "string", in: "cust-9", wantS: "cust-9"},
		{name: "trimmed string", in: "  order-1  ", wantS: "order-1"},
		{name: "boolean true is string", in: "true", wantS: "true"},
		{name: "boolean false is string", in: "false", wantS: "false"},
		{name: "null is string", in: "null", wantS: "null"},
		{name: "quoted number is string", in: `"42"`, wantS: `"42"`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got, err := parseDynamoScalar(tt.in)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got %#v", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("parseDynamoScalar(%q): %v", tt.in, err)
			}
			if tt.wantN != "" {
				n, ok := got.(*types.AttributeValueMemberN)
				if !ok || n.Value != tt.wantN {
					t.Fatalf("got %#v, want N %q", got, tt.wantN)
				}
				return
			}
			s, ok := got.(*types.AttributeValueMemberS)
			if !ok || s.Value != tt.wantS {
				t.Fatalf("got %#v, want S %q", got, tt.wantS)
			}
		})
	}
}

func TestDynamoQueryKeyCondition(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		hashKey    string
		hashValue  string
		rangeKey   string
		rangeValue string
		wantExpr   string
		wantNames  map[string]string
		wantN      map[string]string
		wantS      map[string]string
		wantErr    string
	}{
		{
			name:      "hash only string",
			hashKey:   "pk",
			hashValue: "cust-9",
			wantExpr:  "#hk = :hv",
			wantNames: map[string]string{"#hk": "pk"},
			wantS:     map[string]string{":hv": "cust-9"},
		},
		{
			name:       "hash and range equality",
			hashKey:    " pk ",
			hashValue:  "cust-9",
			rangeKey:   " sk ",
			rangeValue: "order-1",
			wantExpr:   "#hk = :hv AND #rk = :rv",
			wantNames:  map[string]string{"#hk": "pk", "#rk": "sk"},
			wantS:      map[string]string{":hv": "cust-9", ":rv": "order-1"},
		},
		{
			name:       "numeric scalars",
			hashKey:    "id",
			hashValue:  "10",
			rangeKey:   "ts",
			rangeValue: "3.5",
			wantExpr:   "#hk = :hv AND #rk = :rv",
			wantNames:  map[string]string{"#hk": "id", "#rk": "ts"},
			wantN:      map[string]string{":hv": "10", ":rv": "3.5"},
		},
		{
			name:       "range value ignored without range key",
			hashKey:    "pk",
			hashValue:  "cust-9",
			rangeValue: "order-1",
			wantExpr:   "#hk = :hv",
			wantNames:  map[string]string{"#hk": "pk"},
			wantS:      map[string]string{":hv": "cust-9"},
		},
		{
			name:      "empty hash key",
			hashValue: "cust-9",
			wantErr:   "hash key name and value are required",
		},
		{
			name:    "empty hash value",
			hashKey: "pk",
			wantErr: "hash key name and value are required",
		},
		{
			name:      "range key without value",
			hashKey:   "pk",
			hashValue: "cust-9",
			rangeKey:  "sk",
			wantErr:   "range key value is required",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			expr, names, values, err := dynamoQueryKeyCondition(tt.hashKey, tt.hashValue, tt.rangeKey, tt.rangeValue)
			if tt.wantErr != "" {
				if err == nil || err.Error() != tt.wantErr {
					t.Fatalf("err = %v, want %q", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("dynamoQueryKeyCondition: %v", err)
			}
			if expr != tt.wantExpr {
				t.Fatalf("expr = %q, want %q", expr, tt.wantExpr)
			}
			if len(names) != len(tt.wantNames) {
				t.Fatalf("names = %#v, want %#v", names, tt.wantNames)
			}
			for key, want := range tt.wantNames {
				if names[key] != want {
					t.Fatalf("names[%q] = %q, want %q", key, names[key], want)
				}
			}
			if len(values) != len(tt.wantN)+len(tt.wantS) {
				t.Fatalf("values = %#v", values)
			}
			for key, want := range tt.wantS {
				s, ok := values[key].(*types.AttributeValueMemberS)
				if !ok || s.Value != want {
					t.Fatalf("values[%q] = %#v, want S %q", key, values[key], want)
				}
			}
			for key, want := range tt.wantN {
				n, ok := values[key].(*types.AttributeValueMemberN)
				if !ok || n.Value != want {
					t.Fatalf("values[%q] = %#v, want N %q", key, values[key], want)
				}
			}
		})
	}
}
