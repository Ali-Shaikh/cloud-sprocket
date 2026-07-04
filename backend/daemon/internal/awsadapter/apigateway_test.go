// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"fmt"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	agwtypes "github.com/aws/aws-sdk-go-v2/service/apigateway/types"
	agwv2types "github.com/aws/aws-sdk-go-v2/service/apigatewayv2/types"
)

func TestRestApiSummaryMapsEndpoint(t *testing.T) {
	got := restApiSummary(agwtypes.RestApi{
		Id:          aws.String("abc123"),
		Name:        aws.String("orders-api"),
		Description: aws.String("Order service"),
	}, "us-east-1")
	if got.ApiKey != "rest:abc123" || got.ApiType != "REST" || got.Endpoint != "https://abc123.execute-api.us-east-1.amazonaws.com" {
		t.Fatalf("api = %+v", got)
	}
}

func TestV2ApiSummaryMapsHttpApi(t *testing.T) {
	got := v2ApiSummary(agwv2types.Api{
		ApiId:        aws.String("xyz789"),
		Name:         aws.String("http-api"),
		ProtocolType: agwv2types.ProtocolTypeHttp,
		ApiEndpoint:  aws.String("https://xyz789.execute-api.us-east-1.amazonaws.com/"),
	})
	if got.ApiKey != "http:xyz789" || got.ApiType != "HTTP" {
		t.Fatalf("api = %+v", got)
	}
}

func TestRestStageSummaryBuildsInvokeUrl(t *testing.T) {
	got := restStageSummary(agwtypes.Stage{
		StageName:    aws.String("prod"),
		DeploymentId: aws.String("dep1"),
	}, "rest:abc123", "us-east-1", "abc123")
	if got.InvokeUrl != "https://abc123.execute-api.us-east-1.amazonaws.com/prod" {
		t.Fatalf("stage = %+v", got)
	}
}

func TestV2StageSummaryBuildsInvokeUrl(t *testing.T) {
	got := v2StageSummary(agwv2types.Stage{
		StageName: aws.String("$default"),
	}, "http:xyz789", "https://xyz789.execute-api.us-east-1.amazonaws.com")
	if got.InvokeUrl != "https://xyz789.execute-api.us-east-1.amazonaws.com/$default" {
		t.Fatalf("stage = %+v", got)
	}
}

func TestParseApiGatewayKey(t *testing.T) {
	apiType, apiID, err := parseApiGatewayKey("http:xyz789")
	if err != nil || apiType != "http" || apiID != "xyz789" {
		t.Fatalf("parse = %q %q %v", apiType, apiID, err)
	}
}

func TestMergeApiGatewayListOutcomeReturnsPartialResults(t *testing.T) {
	restErr := fmt.Errorf("access denied")
	warning, err := mergeApiGatewayListOutcome(restErr, nil, 2)
	if err != nil {
		t.Fatalf("expected partial success, got error %v", err)
	}
	if warning == "" {
		t.Fatalf("expected warning for REST failure")
	}
}

func TestMergeApiGatewayListOutcomeFailsWhenBothEmpty(t *testing.T) {
	restErr := fmt.Errorf("rest failed")
	v2Err := fmt.Errorf("v2 failed")
	_, err := mergeApiGatewayListOutcome(restErr, v2Err, 0)
	if err == nil {
		t.Fatal("expected combined error when both listings fail")
	}
}