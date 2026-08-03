// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) activeLambdaRegion(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
) (models.ProfileSummary, string, error) {
	if !session.IsLocked || session.CurrentProviderID != "aws" {
		return models.ProfileSummary{}, "", errors.New("open an AWS workspace before using Lambda actions")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return models.ProfileSummary{}, "", errors.New("the workspace's AWS profile is not available")
	}
	regions := s.lambdaRegions(context.Background(), profile)
	region := s.selectedLambdaRegion(session, regions, profile)
	if region == "" {
		return models.ProfileSummary{}, "", errors.New("select a Lambda region before using this action")
	}
	return profile, region, nil
}

func (s *Service) activeLambdaSelection(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	functionNameOverride string,
) (models.ProfileSummary, string, string, error) {
	profile, region, err := s.activeLambdaRegion(snapshot, session)
	if err != nil {
		return models.ProfileSummary{}, "", "", err
	}
	functionName := strings.TrimSpace(functionNameOverride)
	if functionName == "" {
		functionName = session.SelectedLambdaFunctionName
	}
	if functionName == "" {
		functionName = s.selectedLambdaFunctionName(session, s.lambdaFunctions(context.Background(), profile, region))
	}
	if functionName == "" {
		return models.ProfileSummary{}, "", "", errors.New("select a Lambda function before using this action")
	}
	return profile, region, functionName, nil
}

func (s *Service) lambdaRegions(ctx context.Context, profile models.ProfileSummary) []string {
	return s.ec2Regions(ctx, profile)
}

func (s *Service) selectedLambdaRegion(
	session models.SessionSnapshot,
	regions []string,
	profile models.ProfileSummary,
) string {
	if session.SelectedLambdaRegion != "" {
		for _, region := range regions {
			if region == session.SelectedLambdaRegion {
				return session.SelectedLambdaRegion
			}
		}
	}
	hint := profileRegionHint(profile)
	for _, region := range regions {
		if region == hint {
			return hint
		}
	}
	if len(regions) == 0 {
		return ""
	}
	return regions[0]
}

func (s *Service) lambdaFunctions(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) []models.AwsLambdaFunction {
	if region == "" {
		return []models.AwsLambdaFunction{}
	}
	const scope = "aws.lambda.functions"
	queryHash := profile.ProfileID + "|" + region

	var cached []models.AwsLambdaFunction
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	functions, err := s.lambda.ListFunctions(ctx, profile, region)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, functions)
		return functions
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsLambdaFunction{}
}

func (s *Service) selectedLambdaFunctionName(
	session models.SessionSnapshot,
	functions []models.AwsLambdaFunction,
) string {
	if session.SelectedLambdaFunctionName != "" {
		for _, fn := range functions {
			if fn.FunctionName == session.SelectedLambdaFunctionName {
				return session.SelectedLambdaFunctionName
			}
		}
	}
	if len(functions) == 0 {
		return ""
	}
	return functions[0].FunctionName
}

func (s *Service) enrichLambdaInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.lambda == nil {
		return
	}
	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	regions := s.lambdaRegions(timeoutCtx, *workspace.Profile)
	cancel()
	selectedRegion := s.selectedLambdaRegion(session, regions, *workspace.Profile)

	if opts.lightweight {
		status := "No region is available for Lambda functions in this AWS workspace."
		if selectedRegion != "" {
			status = fmt.Sprintf("Loaded %d region(s). Select %s to browse functions.", len(regions), selectedRegion)
		} else if len(regions) > 0 {
			status = fmt.Sprintf("Loaded %d region(s). Select a region to browse functions.", len(regions))
		}
		lockWorkspace(mu, func() {
			workspace.LambdaRegions = regions
			workspace.SelectedLambdaRegion = selectedRegion
			workspace.LambdaFunctions = []models.AwsLambdaFunction{}
			workspace.SelectedLambdaFunctionName = ""
			workspace.LambdaStatusMessage = status
		})
		return
	}

	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	functions := s.lambdaFunctions(timeoutCtx, *workspace.Profile, selectedRegion)
	cancel()
	selectedFunction := s.selectedLambdaFunctionName(session, functions)
	if selectedFunction != "" {
		timeoutCtx, cancel := s.withAWSTimeout(context.Background())
		if full, err := s.lambda.DescribeFunction(timeoutCtx, *workspace.Profile, selectedRegion, selectedFunction); err == nil {
			for i := range functions {
				if functions[i].FunctionName == full.FunctionName {
					functions[i] = full
					break
				}
			}
		}
		cancel()
	}

	status := "No region is available for Lambda functions in this AWS workspace."
	if selectedRegion != "" {
		if len(functions) == 0 {
			status = fmt.Sprintf("No Lambda functions were returned for %s.", selectedRegion)
		} else {
			status = fmt.Sprintf("Loaded %d Lambda functions from %s.", len(functions), selectedRegion)
		}
	}

	lockWorkspace(mu, func() {
		workspace.LambdaRegions = regions
		workspace.SelectedLambdaRegion = selectedRegion
		workspace.LambdaFunctions = functions
		workspace.SelectedLambdaFunctionName = selectedFunction
		workspace.LambdaStatusMessage = status
	})
}
