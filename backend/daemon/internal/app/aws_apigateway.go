// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) enrichApiGatewayInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.apigateway == nil {
		return
	}
	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	regions := s.apiGatewayRegions(timeoutCtx, *workspace.Profile)
	cancel()
	selectedRegion := s.selectedApiGatewayRegion(session, regions, *workspace.Profile)

	if opts.lightweight {
		status := "No region is available for API Gateway in this AWS workspace."
		if selectedRegion != "" {
			status = fmt.Sprintf("Loaded %d region(s). Select %s to browse APIs.", len(regions), selectedRegion)
		} else if len(regions) > 0 {
			status = fmt.Sprintf("Loaded %d region(s). Select a region to browse APIs.", len(regions))
		}
		lockWorkspace(mu, func() {
			workspace.ApiGatewayRegions = regions
			workspace.SelectedApiGatewayRegion = selectedRegion
			workspace.ApiGatewayApis = []models.AwsApiGatewayApi{}
			workspace.ApiGatewayStages = []models.AwsApiGatewayStage{}
			workspace.SelectedApiGatewayApiKey = ""
			workspace.ApiGatewayStatusMessage = status
		})
		return
	}

	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	apis := s.apiGatewayApis(timeoutCtx, *workspace.Profile, selectedRegion)
	cancel()
	selectedAPI := s.selectedApiGatewayApiKey(session, apis)
	stages := []models.AwsApiGatewayStage{}
	if selectedAPI != "" {
		timeoutCtx, cancel = s.withAWSTimeout(context.Background())
		stages = s.apiGatewayStages(timeoutCtx, *workspace.Profile, selectedRegion, selectedAPI)
		cancel()
	}

	status := "No region is available for API Gateway in this AWS workspace."
	if selectedRegion != "" {
		if len(apis) == 0 {
			status = fmt.Sprintf("No API Gateway APIs were returned for %s.", selectedRegion)
		} else if selectedAPI == "" {
			status = fmt.Sprintf("Loaded %d APIs from %s.", len(apis), selectedRegion)
		} else {
			status = fmt.Sprintf("Loaded %d APIs and %d stages from %s.", len(apis), len(stages), selectedRegion)
		}
	}

	lockWorkspace(mu, func() {
		workspace.ApiGatewayRegions = regions
		workspace.SelectedApiGatewayRegion = selectedRegion
		workspace.ApiGatewayApis = apis
		workspace.ApiGatewayStages = stages
		workspace.SelectedApiGatewayApiKey = selectedAPI
		workspace.ApiGatewayStatusMessage = status
	})
}

func (s *Service) apiGatewayRegions(ctx context.Context, profile models.ProfileSummary) []string {
	return s.lambdaRegions(ctx, profile)
}

func (s *Service) selectedApiGatewayRegion(
	session models.SessionSnapshot,
	regions []string,
	profile models.ProfileSummary,
) string {
	if session.SelectedApiGatewayRegion != "" {
		for _, region := range regions {
			if region == session.SelectedApiGatewayRegion {
				return session.SelectedApiGatewayRegion
			}
		}
	}
	return s.selectedECSRegion(session, regions, profile)
}

func (s *Service) apiGatewayApis(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) []models.AwsApiGatewayApi {
	if region == "" {
		return []models.AwsApiGatewayApi{}
	}
	const scope = "aws.apigateway.apis"
	queryHash := profile.ProfileID + "|" + region

	var cached []models.AwsApiGatewayApi
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	apis, err := s.apigateway.ListApis(ctx, profile, region)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, apis)
		return apis
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsApiGatewayApi{}
}

func (s *Service) selectedApiGatewayApiKey(
	session models.SessionSnapshot,
	apis []models.AwsApiGatewayApi,
) string {
	if session.SelectedApiGatewayApiKey != "" {
		for _, api := range apis {
			if api.ApiKey == session.SelectedApiGatewayApiKey {
				return session.SelectedApiGatewayApiKey
			}
		}
	}
	if len(apis) == 0 {
		return ""
	}
	return apis[0].ApiKey
}

func (s *Service) apiGatewayStages(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	apiKey string,
) []models.AwsApiGatewayStage {
	if region == "" || apiKey == "" {
		return []models.AwsApiGatewayStage{}
	}
	const scope = "aws.apigateway.stages"
	queryHash := profile.ProfileID + "|" + region + "|" + apiKey

	var cached []models.AwsApiGatewayStage
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	stages, err := s.apigateway.ListStages(ctx, profile, region, apiKey)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, stages)
		return stages
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsApiGatewayStage{}
}

func (s *Service) handleAwsApiGatewaySelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an API Gateway region", func(session *models.SessionSnapshot) error {
		session.SelectedApiGatewayRegion = request.Region
		session.SelectedApiGatewayApiKey = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{awsScope: "apigateway", skipAzureInventory: true}, "", "", false)
}

func (s *Service) handleAwsApiGatewaySelectApi(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		ApiKey string `json:"apiKey"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an API Gateway API", func(session *models.SessionSnapshot) error {
		session.SelectedApiGatewayApiKey = request.ApiKey
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{awsScope: "apigateway", skipAzureInventory: true}, "", "", false)
}