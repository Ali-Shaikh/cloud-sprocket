// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package labs

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/recipes"
)

// WriteInvoker executes a resolved invoke-write lab action.
type WriteInvoker func(ctx context.Context, op string, params map[string]string) (any, error)

// Runner coordinates lab session lifecycle and step actions.
type Runner struct {
	store    *SessionStore
	registry *Registry
	now      func() time.Time
	faults   *faultTracker
	faultMu  sync.Mutex
	// injectorFor overrides FaultInjectorForDeployment (tests).
	injectorFor func(deployment *deploy.Deployment) deploy.FaultInjector
}

// NewRunner builds a lab runner.
func NewRunner(store *SessionStore, registry *Registry, now func() time.Time) *Runner {
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	return &Runner{
		store:    store,
		registry: registry,
		now:      now,
		faults:   newFaultTracker(),
	}
}

// Start initialises a new lab session for an applied deployment.
func (r *Runner) Start(ctx context.Context, lab *recipes.LabSpec, deployment *deploy.Deployment) (LabSession, error) {
	if lab == nil {
		return LabSession{}, errors.New("this recipe does not include a lab section")
	}
	if deployment == nil {
		return LabSession{}, errors.New("deployment is required")
	}
	if deployment.Status != deploy.StatusApplied {
		return LabSession{}, errors.New("lab can only start after the deployment has been applied")
	}
	if len(lab.Steps) == 0 {
		return LabSession{}, errors.New("lab section has no steps")
	}
	if err := r.RecoverActiveFault(ctx, deployment); err != nil {
		return LabSession{}, err
	}

	now := r.timestamp()
	steps := make([]StepState, 0, len(lab.Steps))
	for index, step := range lab.Steps {
		status := StepStatusPending
		if index == 0 {
			status = StepStatusInProgress
		}
		steps = append(steps, StepState{
			StepID:        step.ID,
			Status:        status,
			VerifyResults: make([]VerifyResult, 0),
		})
	}

	session := LabSession{
		DeploymentID:  deployment.ID,
		RecipeID:      deployment.RecipeID,
		Status:        SessionStatusInProgress,
		StartedAt:     now,
		UpdatedAt:     now,
		CurrentStepID: lab.Steps[0].ID,
		Steps:         steps,
	}
	r.populateFaultStates(&session, lab, deployment)
	if err := r.store.Save(ctx, session); err != nil {
		return LabSession{}, err
	}
	return session, nil
}

// Get returns the persisted lab session for a deployment.
func (r *Runner) Get(ctx context.Context, deploymentID string) (LabSession, bool, error) {
	return r.store.Load(ctx, deploymentID)
}

// VerifyOptions carries workspace gates into verification (not part of the
// recipe). Callers populate these from the active session.
type VerifyOptions struct {
	AWSWritesEnabled bool
}

// VerifyStep runs all verification checks for one step and updates the session.
func (r *Runner) VerifyStep(
	ctx context.Context,
	lab *recipes.LabSpec,
	deployment *deploy.Deployment,
	stepID string,
	profile models.ProfileSummary,
	region string,
	opts VerifyOptions,
) (LabSession, error) {
	stepSpec, ok := findLabStep(lab, stepID)
	if !ok {
		return LabSession{}, fmt.Errorf("lab step %q was not found", stepID)
	}
	if stepSpec.Fault != nil {
		r.faultMu.Lock()
		defer r.faultMu.Unlock()
	} else if err := r.RecoverActiveFault(ctx, deployment); err != nil {
		return LabSession{}, err
	}

	session, found, err := r.store.Load(ctx, deployment.ID)
	if err != nil {
		return LabSession{}, err
	}
	if !found {
		return LabSession{}, errors.New("lab session has not been started for this deployment")
	}
	if stepSpec.Fault != nil && session.ActiveFault != nil {
		if err := r.recoverSessionFault(ctx, deployment, &session); err != nil {
			return LabSession{}, err
		}
	}
	if stepSpec.Fault != nil {
		capability := r.faultState(deployment, stepSpec.Fault)
		for index := range session.Steps {
			if session.Steps[index].StepID == stepID {
				session.Steps[index].Fault = capability
				break
			}
		}
		if capability != nil && !capability.Available {
			now := r.timestamp()
			for index := range session.Steps {
				if session.Steps[index].StepID != stepID {
					continue
				}
				session.Steps[index].Status = StepStatusSkipped
				session.Steps[index].CompletedAt = now
				session.Steps[index].VerifyResults = []VerifyResult{{
					Type:   "fault." + capability.Kind,
					Passed: true,
					Detail: "Skipped: " + capability.Reason,
				}}
				break
			}
			if nextStepID, ok := nextLabStepID(lab, stepID); ok {
				session.CurrentStepID = nextStepID
				markStepInProgress(&session, nextStepID, now)
			} else {
				session.Status = SessionStatusCompleted
				session.CompletedAt = now
				session.CurrentStepID = ""
			}
			session.UpdatedAt = now
			if err := r.store.Save(ctx, session); err != nil {
				return LabSession{}, err
			}
			return session, nil
		}
	}

	// Inject step fault before checks so verifications observe chaos conditions.
	// Persist recovery metadata first, then always clear on the way out.
	if err := r.applyStepFault(ctx, deployment, stepSpec, &session); err != nil {
		return LabSession{}, err
	}
	faultApplied := stepSpec.Fault != nil
	faultCleared := false
	defer func() {
		if faultApplied && !faultCleared {
			_ = r.clearDeploymentFaults(deployment, &session)
		}
	}()

	checkCtx := CheckContext{
		Deployment:       deployment,
		Profile:          profile,
		Region:           region,
		AWSWritesEnabled: opts.AWSWritesEnabled,
	}
	results := make([]VerifyResult, 0, len(stepSpec.Verify))
	allPassed := true
	if len(stepSpec.Verify) == 0 {
		// Guidance / action-only step (e.g. "note the ARN", "explore the tab").
		// Mark as passed so the runner works for inspection-only labs.
		results = []VerifyResult{{
			Type:    "manual",
			Passed:  true,
			Detail:  "No automated checks for this step.",
			Message: "Step completed (no verification defined).",
		}}
	} else {
		for _, verify := range stepSpec.Verify {
			result, runErr := r.registry.Run(ctx, verify, checkCtx)
			if runErr != nil {
				// Record a failed check instead of aborting the whole step so the
				// UI can show which verification failed and the user can retry.
				results = append(results, VerifyResult{
					Type:    verify.Type,
					Passed:  false,
					Detail:  runErr.Error(),
					Message: runErr.Error(),
				})
				allPassed = false
				continue
			}
			results = append(results, result)
			if !result.Passed {
				allPassed = false
			}
		}
	}
	if faultApplied {
		if err := r.clearDeploymentFaults(deployment, &session); err != nil {
			return LabSession{}, err
		}
		faultCleared = true
	}

	now := r.timestamp()
	for index := range session.Steps {
		if session.Steps[index].StepID != stepID {
			continue
		}
		if session.Steps[index].StartedAt == "" {
			session.Steps[index].StartedAt = now
		}
		session.Steps[index].VerifyResults = normaliseVerifyResults(results)
		if allPassed {
			session.Steps[index].Status = StepStatusPassed
			session.Steps[index].CompletedAt = now
		} else {
			session.Steps[index].Status = StepStatusFailed
			session.Steps[index].CompletedAt = ""
		}
		break
	}

	if allPassed {
		if nextStepID, ok := nextLabStepID(lab, stepID); ok {
			session.CurrentStepID = nextStepID
			markStepInProgress(&session, nextStepID, now)
		} else {
			session.Status = SessionStatusCompleted
			session.CompletedAt = now
			session.CurrentStepID = ""
		}
	}

	session.UpdatedAt = now
	if err := r.store.Save(ctx, session); err != nil {
		return LabSession{}, err
	}
	return session, nil
}

// RunAction resolves and optionally executes one lab action.
func (r *Runner) RunAction(
	ctx context.Context,
	lab *recipes.LabSpec,
	deployment *deploy.Deployment,
	stepID string,
	actionIndex int,
	profile models.ProfileSummary,
	region string,
	invoke WriteInvoker,
) (any, error) {
	if err := r.RecoverActiveFault(ctx, deployment); err != nil {
		return nil, err
	}
	if _, found, err := r.store.Load(ctx, deployment.ID); err != nil {
		return nil, err
	} else if !found {
		return nil, errors.New("lab session has not been started for this deployment")
	}

	stepSpec, ok := findLabStep(lab, stepID)
	if !ok {
		return nil, fmt.Errorf("lab step %q was not found", stepID)
	}
	if actionIndex < 0 || actionIndex >= len(stepSpec.Actions) {
		return nil, fmt.Errorf("lab action index %d is out of range", actionIndex)
	}
	action := stepSpec.Actions[actionIndex]

	switch strings.TrimSpace(action.Type) {
	case recipes.LabActionOpenTab:
		return OpenTabAction{
			Type:  recipes.LabActionOpenTab,
			Tab:   action.Tab,
			Focus: ResolveTemplate(action.Focus, deployment),
		}, nil
	case recipes.LabActionInvokeWrite:
		if invoke == nil {
			return nil, errors.New("write actions are not available")
		}
		params := ResolveTemplateMap(action.Params, deployment)
		return invoke(ctx, action.Op, params)
	default:
		return nil, fmt.Errorf("lab action type %q is not supported", action.Type)
	}
}

// Reset clears and restarts the lab session for a deployment.
func (r *Runner) Reset(ctx context.Context, lab *recipes.LabSpec, deployment *deploy.Deployment) (LabSession, error) {
	if deployment != nil {
		if err := r.RecoverActiveFault(ctx, deployment); err != nil {
			return LabSession{}, err
		}
	}
	if err := r.store.Delete(ctx, deployment.ID); err != nil {
		return LabSession{}, err
	}
	return r.Start(ctx, lab, deployment)
}

func (r *Runner) timestamp() string {
	return r.now().Format(time.RFC3339)
}

func findLabStep(lab *recipes.LabSpec, stepID string) (recipes.LabStep, bool) {
	if lab == nil {
		return recipes.LabStep{}, false
	}
	for _, step := range lab.Steps {
		if step.ID == stepID {
			return step, true
		}
	}
	return recipes.LabStep{}, false
}

func nextLabStepID(lab *recipes.LabSpec, currentID string) (string, bool) {
	if lab == nil {
		return "", false
	}
	for index, step := range lab.Steps {
		if step.ID == currentID && index+1 < len(lab.Steps) {
			return lab.Steps[index+1].ID, true
		}
	}
	return "", false
}

func markStepInProgress(session *LabSession, stepID, now string) {
	if session == nil {
		return
	}
	for index := range session.Steps {
		if session.Steps[index].StepID != stepID {
			continue
		}
		if session.Steps[index].Status == StepStatusPending {
			session.Steps[index].Status = StepStatusInProgress
		}
		if session.Steps[index].StartedAt == "" {
			session.Steps[index].StartedAt = now
		}
		break
	}
}

func normaliseVerifyResults(results []VerifyResult) []VerifyResult {
	if len(results) == 0 {
		return nil
	}
	normalised := make([]VerifyResult, len(results))
	for index, result := range results {
		normalised[index] = result
		if strings.TrimSpace(normalised[index].Detail) == "" {
			normalised[index].Detail = strings.TrimSpace(result.Message)
		}
	}
	return normalised
}
