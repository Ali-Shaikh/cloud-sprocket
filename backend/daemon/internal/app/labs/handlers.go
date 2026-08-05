// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package labs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/labs"
	"cloudsprocket/backend/daemon/internal/recipes"
)

// RecoverActiveFaults walks stored deployments and reverts any active lab
// faults left from a previous process. Call at daemon startup.
func (s *Service) RecoverActiveFaults(ctx context.Context) error {
	if s.deployments == nil || s.runner == nil {
		return nil
	}
	deployments, err := s.deployments.List(ctx)
	if err != nil {
		return err
	}
	var recoveryErrors []error
	for index := range deployments {
		if err := s.runner.RecoverActiveFault(ctx, &deployments[index]); err != nil {
			recoveryErrors = append(recoveryErrors, fmt.Errorf("deployment %s: %w", deployments[index].ID, err))
			continue
		}
		// Fault recovery pauses/unpauses containers; drop the runtime cache so
		// the next snapshot rebuilds managed resource state.
		if s.invalidator != nil {
			s.invalidator.InvalidateRuntimeStatus()
		}
	}
	return errors.Join(recoveryErrors...)
}

// HandleStart implements labs.start.
func (s *Service) HandleStart(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
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
	session, err := s.runner.Start(ctx, labSpec, deployment)
	if err != nil {
		return nil, err
	}
	emitLabChanged(notifier, session)
	return session, nil
}

// HandleGet implements labs.get.
func (s *Service) HandleGet(ctx context.Context, params json.RawMessage, _ sessionport.Notifier) (any, error) {
	var request struct {
		DeploymentID string `json:"deploymentId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	session, found, err := s.runner.Get(ctx, request.DeploymentID)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, errors.New("lab session has not been started for this deployment")
	}
	return session, nil
}

// HandleVerifyStep implements labs.verifyStep.
func (s *Service) HandleVerifyStep(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
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
	profile, err := DeploymentProfile(snapshot, deployment)
	if err != nil {
		return nil, err
	}
	region := DeploymentAWSRegion(deployment, profile)
	// Load workspace session for write-mode gates on side-effecting / sensitive verifies.
	workspace, err := s.session.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	session, err := s.runner.VerifyStep(
		ctx,
		labSpec,
		deployment,
		request.StepID,
		profile,
		region,
		labs.VerifyOptions{AWSWritesEnabled: WritesEnabled(workspace, profile)},
	)
	if err != nil {
		return nil, err
	}
	emitLabChanged(notifier, session)
	return session, nil
}

// HandleRunAction implements labs.runAction.
func (s *Service) HandleRunAction(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
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
	stepSpec, ok := FindLabStepSpec(labSpec, request.StepID)
	if !ok {
		return nil, fmt.Errorf("lab step %q was not found", request.StepID)
	}
	actionIndex, err := ResolveLabActionIndex(stepSpec, request.ActionIndex, request.Action)
	if err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, err := s.session.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	profile, err := DeploymentProfile(snapshot, deployment)
	if err != nil {
		return nil, err
	}
	region := DeploymentAWSRegion(deployment, profile)
	actionResult, err := s.runner.RunAction(
		ctx,
		labSpec,
		deployment,
		request.StepID,
		actionIndex,
		profile,
		region,
		func(actionCtx context.Context, op string, actionParams map[string]string) (any, error) {
			if s.writes == nil {
				return nil, errors.New("write actions are not available")
			}
			return s.writes.InvokeWrite(actionCtx, snapshot, session, deployment, profile, region, op, actionParams)
		},
	)
	if err != nil {
		return nil, err
	}
	// Lab actions may inject Docker pause faults; invalidate so inventory and
	// Local Runtime views pick up container state changes promptly.
	if s.invalidator != nil {
		s.invalidator.InvalidateRuntimeStatus()
	}
	sessionState, found, getErr := s.runner.Get(ctx, deployment.ID)
	if getErr != nil {
		return nil, getErr
	}
	if !found {
		return nil, errors.New("lab session has not been started for this deployment")
	}
	emitLabChanged(notifier, sessionState)
	return labs.LabRunActionResult{
		Session: sessionState,
		Action:  actionResult,
	}, nil
}

// HandleReset implements labs.reset.
func (s *Service) HandleReset(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
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
	session, err := s.runner.Reset(ctx, labSpec, deployment)
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateRuntimeStatus()
	}
	emitLabChanged(notifier, session)
	return session, nil
}

func (s *Service) loadDeploymentLab(ctx context.Context, deploymentID string) (*deploy.Deployment, *recipes.LabSpec, error) {
	if s.deployments == nil {
		return nil, nil, errors.New("deployment service not available")
	}
	if s.recipes == nil {
		return nil, nil, errors.New("recipe catalogue is not available")
	}
	deployment, err := s.deployments.Get(ctx, deploymentID)
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

func emitLabChanged(notifier sessionport.Notifier, session labs.LabSession) {
	if notifier == nil {
		return
	}
	_ = notifier.Notify("lab.changed", session)
}
