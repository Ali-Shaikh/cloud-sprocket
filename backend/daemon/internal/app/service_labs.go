// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/labs"
	"cloudsprocket/backend/daemon/internal/labs/checks"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/recipes"
)

func (s *Service) labRunner() *labs.Runner {
	store := labs.NewSessionStore(s.store)
	registry := labs.NewRegistry(
		&checks.SQSQueueAttributeCheck{Deps: checks.SQSDeps{DescribeQueue: s.sqs.DescribeQueue}},
		&checks.HTTPGetCheck{Deps: checks.HTTPDeps{Get: s.labsHTTPGet}},
	)
	return labs.NewRunner(store, registry, s.now)
}

func (s *Service) labsHTTPGet(ctx context.Context, targetURL string) (int, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return 0, err
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()
	return response.StatusCode, nil
}

func (s *Service) deploymentProfile(snapshot discovery.Snapshot, deployment *deploy.Deployment) (models.ProfileSummary, error) {
	profiles := filterProfiles(snapshot.Profiles, deployment.ProviderID)
	if profileID := strings.TrimSpace(deployment.ProfileID); profileID != "" {
		profile, ok := findProfile(profiles, profileID)
		if !ok {
			return models.ProfileSummary{}, errors.New("the deployment profile is not available")
		}
		return profile, nil
	}
	if len(profiles) == 0 {
		return models.ProfileSummary{}, errors.New("no connection profile is available for this deployment")
	}
	return profiles[0], nil
}

func (s *Service) deploymentAWSRegion(deployment *deploy.Deployment, profile models.ProfileSummary) string {
	if deployment != nil && deployment.Variables != nil {
		if region, ok := deployment.Variables["aws_region"]; ok {
			regionText := strings.TrimSpace(fmt.Sprint(region))
			if regionText != "" {
				return regionText
			}
		}
	}
	return profileRegionHint(profile)
}

func (s *Service) emitLabChanged(notifier Notifier, session labs.LabSession) {
	if notifier == nil {
		return
	}
	_ = notifier.Notify("lab.changed", session)
}

func (s *Service) loadDeploymentLab(ctx context.Context, deploymentID string) (*deploy.Deployment, *recipes.LabSpec, error) {
	deployment, err := s.deploymentGet(ctx, deploymentID)
	if err != nil {
		return nil, nil, err
	}
	recipe, err := s.recipes.Load(deployment.RecipeID)
	if err != nil {
		return nil, nil, err
	}
	if recipe.Manifest.Lab == nil {
		return nil, nil, errors.New("this recipe does not include a lab section")
	}
	return deployment, recipe.Manifest.Lab, nil
}

func (s *Service) handleLabsStart(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		DeploymentID string `json:"deploymentId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	deployment, labSpec, err := s.loadDeploymentLab(ctx, request.DeploymentID)
	if err != nil {
		return nil, err
	}
	session, err := s.labRunner().Start(ctx, labSpec, deployment)
	if err != nil {
		return nil, err
	}
	s.emitLabChanged(notifier, session)
	return session, nil
}

func (s *Service) handleLabsGet(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
	var request struct {
		DeploymentID string `json:"deploymentId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	session, found, err := s.labRunner().Get(ctx, request.DeploymentID)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, errors.New("lab session has not been started for this deployment")
	}
	return session, nil
}

func (s *Service) handleLabsVerifyStep(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		DeploymentID string `json:"deploymentId"`
		StepID       string `json:"stepId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	deployment, labSpec, err := s.loadDeploymentLab(ctx, request.DeploymentID)
	if err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	profile, err := s.deploymentProfile(snapshot, deployment)
	if err != nil {
		return nil, err
	}
	region := s.deploymentAWSRegion(deployment, profile)
	session, err := s.labRunner().VerifyStep(ctx, labSpec, deployment, request.StepID, profile, region)
	if err != nil {
		return nil, err
	}
	s.emitLabChanged(notifier, session)
	return session, nil
}

func (s *Service) handleLabsRunAction(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		DeploymentID string          `json:"deploymentId"`
		StepID       string          `json:"stepId"`
		ActionIndex  *int            `json:"actionIndex"`
		Action       json.RawMessage `json:"action"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	deployment, labSpec, err := s.loadDeploymentLab(ctx, request.DeploymentID)
	if err != nil {
		return nil, err
	}
	stepSpec, ok := findLabStepSpec(labSpec, request.StepID)
	if !ok {
		return nil, fmt.Errorf("lab step %q was not found", request.StepID)
	}
	actionIndex, err := resolveLabActionIndex(stepSpec, request.ActionIndex, request.Action)
	if err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	profile, err := s.deploymentProfile(snapshot, deployment)
	if err != nil {
		return nil, err
	}
	region := s.deploymentAWSRegion(deployment, profile)
	actionResult, err := s.labRunner().RunAction(
		ctx,
		labSpec,
		deployment,
		request.StepID,
		actionIndex,
		profile,
		region,
		func(actionCtx context.Context, op string, actionParams map[string]string) (any, error) {
			return s.labsInvokeWrite(actionCtx, snapshot, session, deployment, profile, region, op, actionParams)
		},
	)
	if err != nil {
		return nil, err
	}
	sessionState, found, getErr := s.labRunner().Get(ctx, deployment.ID)
	if getErr != nil {
		return nil, getErr
	}
	if !found {
		return nil, errors.New("lab session has not been started for this deployment")
	}
	s.emitLabChanged(notifier, sessionState)
	return labs.LabRunActionResult{
		Session: sessionState,
		Action:  actionResult,
	}, nil
}

func findLabStepSpec(labSpec *recipes.LabSpec, stepID string) (recipes.LabStep, bool) {
	if labSpec == nil {
		return recipes.LabStep{}, false
	}
	for _, step := range labSpec.Steps {
		if step.ID == stepID {
			return step, true
		}
	}
	return recipes.LabStep{}, false
}

func resolveLabActionIndex(step recipes.LabStep, actionIndex *int, action json.RawMessage) (int, error) {
	if actionIndex != nil {
		if *actionIndex < 0 || *actionIndex >= len(step.Actions) {
			return 0, fmt.Errorf("lab action index %d is out of range", *actionIndex)
		}
		return *actionIndex, nil
	}
	if len(action) == 0 {
		return 0, errors.New("lab action index is required")
	}
	var payload struct {
		Type string `json:"type"`
		Tab  string `json:"tab"`
		Op   string `json:"op"`
	}
	if err := json.Unmarshal(action, &payload); err != nil {
		return 0, err
	}
	for index, candidate := range step.Actions {
		if strings.TrimSpace(candidate.Type) != strings.TrimSpace(payload.Type) {
			continue
		}
		switch strings.TrimSpace(candidate.Type) {
		case recipes.LabActionOpenTab:
			if strings.TrimSpace(candidate.Tab) == strings.TrimSpace(payload.Tab) {
				return index, nil
			}
		case recipes.LabActionInvokeWrite:
			if strings.TrimSpace(candidate.Op) == strings.TrimSpace(payload.Op) {
				return index, nil
			}
		default:
			return index, nil
		}
	}
	return 0, errors.New("lab action was not found in this step")
}

func (s *Service) handleLabsReset(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		DeploymentID string `json:"deploymentId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	deployment, labSpec, err := s.loadDeploymentLab(ctx, request.DeploymentID)
	if err != nil {
		return nil, err
	}
	session, err := s.labRunner().Reset(ctx, labSpec, deployment)
	if err != nil {
		return nil, err
	}
	s.emitLabChanged(notifier, session)
	return session, nil
}

func (s *Service) labsInvokeWrite(
	ctx context.Context,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	deployment *deploy.Deployment,
	profile models.ProfileSummary,
	region string,
	op string,
	params map[string]string,
) (any, error) {
	switch strings.TrimSpace(op) {
	case "sqs.send":
		if deployment.ProviderID != "aws" {
			return nil, errors.New("SQS send is only available for AWS deployments")
		}
		if !effectiveAWSWritesEnabled(session, profile) {
			return nil, errors.New("SQS send requires write mode to be enabled")
		}
		queueURL := strings.TrimSpace(params["queueUrl"])
		messageBody := params["messageBody"]
		if queueURL == "" {
			return nil, errors.New("queue URL is required")
		}
		if strings.TrimSpace(messageBody) == "" {
			return nil, errors.New("message body is required")
		}
		_ = snapshot
		actionCtx, cancel := s.withAWSTimeout(ctx)
		defer cancel()
		return s.sqs.SendMessage(actionCtx, profile, region, queueURL, messageBody)
	default:
		return nil, fmt.Errorf("lab write operation %q is not supported", op)
	}
}