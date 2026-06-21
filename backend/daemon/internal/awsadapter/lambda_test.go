// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/lambda/types"
)

func TestLambdaFunctionSummaryMapsCoreFields(t *testing.T) {
	lastModified := "2026-06-10T12:00:00Z"
	memory := int32(512)
	cfg := &types.FunctionConfiguration{
		FunctionName: aws.String("process-order"),
		Runtime:      types.RuntimeNodejs20x,
		Description:  aws.String("Handles order processing"),
		MemorySize:   &memory,
		LastModified: &lastModified,
		State:        types.StateActive,
	}

	got := lambdaFunctionSummary(cfg)

	if got.FunctionName != "process-order" {
		t.Fatalf("FunctionName = %q", got.FunctionName)
	}
	if got.Runtime != string(types.RuntimeNodejs20x) {
		t.Fatalf("Runtime = %q", got.Runtime)
	}
	if got.Description != "Handles order processing" {
		t.Fatalf("Description = %q", got.Description)
	}
	if got.MemorySize != 512 {
		t.Fatalf("MemorySize = %d", got.MemorySize)
	}
	if got.LastModified != lastModified {
		t.Fatalf("LastModified = %q", got.LastModified)
	}
	if got.State != "Active" {
		t.Fatalf("State = %q", got.State)
	}
}

func TestLambdaFunctionSummaryNormalisesRFC3339LastModified(t *testing.T) {
	ts := time.Date(2026, 6, 10, 12, 0, 0, 0, time.UTC)
	cfg := &types.FunctionConfiguration{
		FunctionName: aws.String("resize-image"),
		LastModified: aws.String(ts.Format(time.RFC3339)),
	}

	got := lambdaFunctionSummary(cfg)
	if got.LastModified != ts.UTC().Format(time.RFC3339) {
		t.Fatalf("LastModified = %q", got.LastModified)
	}
}

func TestLambdaFunctionSummaryNilConfiguration(t *testing.T) {
	got := lambdaFunctionSummary(nil)
	if got.FunctionName != "" {
		t.Fatalf("expected empty summary, got %+v", got)
	}
}