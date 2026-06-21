// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

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
	if s.ec2 == nil {
		if hint := profileRegionHint(profile); hint != "" {
			return []string{hint}
		}
		return []string{}
	}
	regs, err := s.ec2.ListRegions(ctx, profile)
	if err != nil || len(regs) == 0 {
		if hint := profileRegionHint(profile); hint != "" {
			return []string{hint}
		}
		return []string{}
	}
	return regs
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
	functions, err := s.lambda.ListFunctions(ctx, profile, region)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, functions, s.timestamp())
		return functions
	}
	var cached []models.AwsLambdaFunction
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

func (s *Service) enrichLambdaInventory(workspace *models.WorkspaceSnapshot, session models.SessionSnapshot) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.lambda == nil {
		return
	}
	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	workspace.LambdaRegions = s.lambdaRegions(timeoutCtx, *workspace.Profile)
	cancel()
	workspace.SelectedLambdaRegion = s.selectedLambdaRegion(session, workspace.LambdaRegions, *workspace.Profile)
	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	workspace.LambdaFunctions = s.lambdaFunctions(timeoutCtx, *workspace.Profile, workspace.SelectedLambdaRegion)
	cancel()
	workspace.SelectedLambdaFunctionName = s.selectedLambdaFunctionName(session, workspace.LambdaFunctions)
	if workspace.SelectedLambdaRegion == "" {
		workspace.LambdaStatusMessage = "No region is available for Lambda functions in this AWS workspace."
	} else if len(workspace.LambdaFunctions) == 0 {
		workspace.LambdaStatusMessage = fmt.Sprintf("No Lambda functions were returned for %s.", workspace.SelectedLambdaRegion)
	} else {
		workspace.LambdaStatusMessage = fmt.Sprintf(
			"Loaded %d Lambda functions from %s.",
			len(workspace.LambdaFunctions),
			workspace.SelectedLambdaRegion,
		)
	}
	if workspace.SelectedLambdaFunctionName != "" && workspace.Profile != nil {
		timeoutCtx, cancel := s.withAWSTimeout(context.Background())
		if full, err := s.lambda.DescribeFunction(timeoutCtx, *workspace.Profile, workspace.SelectedLambdaRegion, workspace.SelectedLambdaFunctionName); err == nil {
			for i := range workspace.LambdaFunctions {
				if workspace.LambdaFunctions[i].FunctionName == full.FunctionName {
					workspace.LambdaFunctions[i] = full
					break
				}
			}
		}
		cancel()
	}
}

func (s *Service) handleAwsLambdaSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a Lambda region", func(session *models.SessionSnapshot) error {
		session.SelectedLambdaRegion = request.Region
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspace(ctx, snapshot, session, notifier, "info", fmt.Sprintf("Selected Lambda region %s.", request.Region), true)
}

func (s *Service) handleAwsLambdaSelectFunction(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		FunctionName string `json:"functionName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a Lambda function", func(session *models.SessionSnapshot) error {
		session.SelectedLambdaFunctionName = request.FunctionName
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspace(ctx, snapshot, session, notifier, "", "", false)
}

func (s *Service) handleAwsLambdaDescribe(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		FunctionName string `json:"functionName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	profile, region, functionName, err := s.activeLambdaSelection(snapshot, session, request.FunctionName)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	s.mu.Unlock()
	fn, err := s.lambda.DescribeFunction(ctx, profile, region, functionName)
	if err != nil {
		return nil, err
	}
	return fn, nil
}

func (s *Service) handleAwsLambdaInvoke(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		FunctionName string          `json:"functionName"`
		Payload      json.RawMessage `json:"payload"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	profile, region, functionName, err := s.activeLambdaSelection(snapshot, session, request.FunctionName)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !effectiveAWSWritesEnabled(session, profile) {
		s.mu.Unlock()
		return nil, errors.New("Lambda invoke requires write mode to be enabled and a profile with local endpoint_url and cloudsprocket_allow_writes = true")
	}
	s.mu.Unlock()
	payload := []byte(request.Payload)
	if len(payload) == 0 {
		payload = []byte("{}")
	}
	result, err := s.lambda.InvokeFunction(ctx, profile, region, functionName, payload)
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (s *Service) handleAwsLambdaCreate(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request models.AwsLambdaCreateInput
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	if err := validateLambdaCreateInput(request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !session.IsLocked || session.CurrentProviderID != "aws" {
		s.mu.Unlock()
		return nil, errors.New("open an AWS workspace before creating a Lambda function")
	}
	profile, region, err := s.activeLambdaRegion(snapshot, session)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !effectiveAWSWritesEnabled(session, profile) {
		s.mu.Unlock()
		return nil, errors.New("Lambda create requires write mode to be enabled and a profile with local endpoint_url and cloudsprocket_allow_writes = true")
	}
	s.mu.Unlock()

	created, err := s.lambda.CreateFunction(ctx, profile, region, request)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	session, err = s.currentState(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	session.SelectedLambdaFunctionName = created.FunctionName
	if err := s.store.SaveSession(ctx, session); err != nil {
		return nil, err
	}
	return s.buildWorkspaceSnapshot(snapshot, session), s.notifyStateAndLog(
		ctx,
		snapshot,
		session,
		notifier,
		"success",
		fmt.Sprintf("Created Lambda function %s in %s.", created.FunctionName, region),
	)
}
