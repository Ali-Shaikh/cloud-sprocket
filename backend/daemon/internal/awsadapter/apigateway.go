// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/apigateway"
	agwtypes "github.com/aws/aws-sdk-go-v2/service/apigateway/types"
	"github.com/aws/aws-sdk-go-v2/service/apigatewayv2"
	agwv2types "github.com/aws/aws-sdk-go-v2/service/apigatewayv2/types"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

// ApiGatewayInventory provides read-only inventory for REST and HTTP/WebSocket APIs.
type ApiGatewayInventory struct {
	settings config.Settings
}

func NewApiGatewayInventory(settings config.Settings) *ApiGatewayInventory {
	return &ApiGatewayInventory{settings: settings}
}

func (a *ApiGatewayInventory) ListApis(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) ([]models.AwsApiGatewayApi, error) {
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := a.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	apis := []models.AwsApiGatewayApi{}

	restClient := apigatewayClient(cfg, profile)
	restPaginator := apigateway.NewGetRestApisPaginator(restClient, &apigateway.GetRestApisInput{})
	for restPaginator.HasMorePages() {
		page, err := restPaginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, item := range page.Items {
			apis = append(apis, restApiSummary(item, region))
		}
	}

	v2Client := apigatewayV2Client(cfg, profile)
	v2Input := &apigatewayv2.GetApisInput{}
	for {
		page, err := v2Client.GetApis(ctx, v2Input)
		if err != nil {
			return nil, err
		}
		for _, item := range page.Items {
			apis = append(apis, v2ApiSummary(item))
		}
		if page.NextToken == nil || *page.NextToken == "" {
			break
		}
		v2Input.NextToken = page.NextToken
	}

	sort.SliceStable(apis, func(i, j int) bool {
		if apis[i].ApiType == apis[j].ApiType {
			return apis[i].ApiName < apis[j].ApiName
		}
		return apis[i].ApiType < apis[j].ApiType
	})
	return apis, nil
}

func (a *ApiGatewayInventory) ListStages(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	apiKey string,
) ([]models.AwsApiGatewayStage, error) {
	apiType, apiID, err := parseApiGatewayKey(apiKey)
	if err != nil {
		return nil, err
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := a.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	switch apiType {
	case "rest":
		return a.listRestStages(ctx, cfg, profile, region, apiID, apiKey)
	case "http", "websocket":
		return a.listV2Stages(ctx, cfg, profile, apiID, apiKey)
	default:
		return nil, fmt.Errorf("unsupported API Gateway type %q", apiType)
	}
}

func (a *ApiGatewayInventory) listRestStages(
	ctx context.Context,
	cfg aws.Config,
	profile models.ProfileSummary,
	region string,
	apiID string,
	apiKey string,
) ([]models.AwsApiGatewayStage, error) {
	client := apigatewayClient(cfg, profile)
	page, err := client.GetStages(ctx, &apigateway.GetStagesInput{
		RestApiId: aws.String(apiID),
	})
	if err != nil {
		return nil, err
	}
	stages := []models.AwsApiGatewayStage{}
	for _, stage := range page.Item {
		stages = append(stages, restStageSummary(stage, apiKey, region, apiID))
	}
	sort.SliceStable(stages, func(i, j int) bool {
		return stages[i].StageName < stages[j].StageName
	})
	return stages, nil
}

func (a *ApiGatewayInventory) listV2Stages(
	ctx context.Context,
	cfg aws.Config,
	profile models.ProfileSummary,
	apiID string,
	apiKey string,
) ([]models.AwsApiGatewayStage, error) {
	client := apigatewayV2Client(cfg, profile)
	apiPage, err := client.GetApi(ctx, &apigatewayv2.GetApiInput{
		ApiId: aws.String(apiID),
	})
	if err != nil {
		return nil, err
	}
	apiEndpoint := awsString(apiPage.ApiEndpoint)
	page, err := client.GetStages(ctx, &apigatewayv2.GetStagesInput{
		ApiId: aws.String(apiID),
	})
	if err != nil {
		return nil, err
	}
	stages := []models.AwsApiGatewayStage{}
	for _, stage := range page.Items {
		stages = append(stages, v2StageSummary(stage, apiKey, apiEndpoint))
	}
	sort.SliceStable(stages, func(i, j int) bool {
		return stages[i].StageName < stages[j].StageName
	})
	return stages, nil
}

func (a *ApiGatewayInventory) loadConfig(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) (aws.Config, error) {
	return loadAWSConfig(ctx, a.settings, profile, region)
}

func apigatewayClient(cfg aws.Config, profile models.ProfileSummary) *apigateway.Client {
	return apigateway.NewFromConfig(cfg, func(options *apigateway.Options) {
		if endpointURL := awsEndpointURL(profile); endpointURL != "" {
			options.BaseEndpoint = aws.String(endpointURL)
		}
	})
}

func apigatewayV2Client(cfg aws.Config, profile models.ProfileSummary) *apigatewayv2.Client {
	return apigatewayv2.NewFromConfig(cfg, func(options *apigatewayv2.Options) {
		if endpointURL := awsEndpointURL(profile); endpointURL != "" {
			options.BaseEndpoint = aws.String(endpointURL)
		}
	})
}

func parseApiGatewayKey(apiKey string) (apiType string, apiID string, err error) {
	apiKey = strings.TrimSpace(apiKey)
	parts := strings.SplitN(apiKey, ":", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", fmt.Errorf("API key must be in the form type:id")
	}
	return strings.ToLower(parts[0]), parts[1], nil
}

func restApiSummary(item agwtypes.RestApi, region string) models.AwsApiGatewayApi {
	apiID := awsString(item.Id)
	return models.AwsApiGatewayApi{
		ApiKey:      "rest:" + apiID,
		ApiId:       apiID,
		ApiName:     awsString(item.Name),
		ApiType:     "REST",
		Description: awsString(item.Description),
		Endpoint:    fmt.Sprintf("https://%s.execute-api.%s.amazonaws.com", apiID, region),
	}
}

func v2ApiSummary(item agwv2types.Api) models.AwsApiGatewayApi {
	apiID := awsString(item.ApiId)
	protocol := string(item.ProtocolType)
	apiType := "HTTP"
	if protocol == string(agwv2types.ProtocolTypeWebsocket) {
		apiType = "WEBSOCKET"
	}
	return models.AwsApiGatewayApi{
		ApiKey:      strings.ToLower(apiType) + ":" + apiID,
		ApiId:       apiID,
		ApiName:     awsString(item.Name),
		ApiType:     apiType,
		Description: awsString(item.Description),
		Endpoint:    awsString(item.ApiEndpoint),
		Protocol:    protocol,
	}
}

func restStageSummary(
	stage agwtypes.Stage,
	apiKey string,
	region string,
	apiID string,
) models.AwsApiGatewayStage {
	stageName := awsString(stage.StageName)
	summary := models.AwsApiGatewayStage{
		ApiKey:       apiKey,
		StageName:    stageName,
		DeploymentId: awsString(stage.DeploymentId),
		Description:  awsString(stage.Description),
		InvokeUrl:    fmt.Sprintf("https://%s.execute-api.%s.amazonaws.com/%s", apiID, region, stageName),
	}
	return summary
}

func v2StageSummary(stage agwv2types.Stage, apiKey string, apiEndpoint string) models.AwsApiGatewayStage {
	stageName := awsString(stage.StageName)
	invokeURL := ""
	if apiEndpoint != "" && stageName != "" {
		invokeURL = strings.TrimSuffix(apiEndpoint, "/") + "/" + stageName
	}
	summary := models.AwsApiGatewayStage{
		ApiKey:      apiKey,
		StageName:   stageName,
		Description: awsString(stage.Description),
		InvokeUrl:   invokeURL,
		AutoDeploy:  boolValue(stage.AutoDeploy),
	}
	return summary
}