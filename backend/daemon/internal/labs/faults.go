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
	"cloudsprocket/backend/daemon/internal/recipes"
)

const faultCleanupTimeout = 10 * time.Second

// faultTracker holds live revert functions for active chaos faults per deployment.
// Active fault metadata is also persisted on the lab session for restart recovery.
type faultTracker struct {
	mu      sync.Mutex
	reverts map[string][]func() error
}

func newFaultTracker() *faultTracker {
	return &faultTracker{reverts: map[string][]func() error{}}
}

func (t *faultTracker) add(deploymentID string, revert func() error) {
	if t == nil || revert == nil || deploymentID == "" {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.reverts[deploymentID] = append(t.reverts[deploymentID], revert)
}

func (t *faultTracker) clear(deploymentID string) (bool, error) {
	if t == nil || deploymentID == "" {
		return false, nil
	}
	t.mu.Lock()
	list := t.reverts[deploymentID]
	delete(t.reverts, deploymentID)
	t.mu.Unlock()

	var first error
	for i := len(list) - 1; i >= 0; i-- {
		if err := list[i](); err != nil && first == nil {
			first = err
		}
	}
	return len(list) > 0, first
}

func labFaultToDeploy(fault *recipes.LabFault) (deploy.Fault, error) {
	if fault == nil {
		return deploy.Fault{}, fmt.Errorf("fault is required")
	}
	kind := deploy.FaultKind(strings.TrimSpace(fault.Kind))
	if kind == "" {
		return deploy.Fault{}, fmt.Errorf("fault kind is required")
	}
	return deploy.Fault{
		Kind:   kind,
		Target: strings.TrimSpace(fault.Target),
		Params: fault.Params,
	}, nil
}

func activeFaultToDeploy(active *ActiveFault) (deploy.Fault, error) {
	if active == nil {
		return deploy.Fault{}, errors.New("active fault is required")
	}
	return labFaultToDeploy(&recipes.LabFault{
		Kind:   active.Kind,
		Target: active.Target,
		Params: active.Params,
	})
}

func (r *Runner) faultInjector(deployment *deploy.Deployment) deploy.FaultInjector {
	if r.injectorFor != nil {
		if injector := r.injectorFor(deployment); injector != nil {
			return injector
		}
	}
	return deploy.FaultInjectorForDeployment(deployment)
}

func (r *Runner) faultState(deployment *deploy.Deployment, fault *recipes.LabFault) *FaultState {
	if fault == nil {
		return nil
	}
	request, err := labFaultToDeploy(fault)
	state := &FaultState{Kind: strings.TrimSpace(fault.Kind), Target: strings.TrimSpace(fault.Target)}
	if err != nil {
		state.Reason = err.Error()
		return state
	}
	injector := r.faultInjector(deployment)
	if deploy.Supports(injector, request.Kind) {
		if validator, ok := injector.(deploy.FaultValidator); ok {
			if validateErr := validator.Validate(request); validateErr != nil {
				state.Reason = validateErr.Error()
				return state
			}
		}
		state.Available = true
		return state
	}
	runtimeID := "selected runtime"
	if deployment != nil && strings.TrimSpace(deployment.RuntimeID) != "" {
		runtimeID = strings.TrimSpace(deployment.RuntimeID)
	}
	if deployment == nil || !deployment.Local {
		state.Reason = "Chaos faults are available only on supported local runtimes."
		return state
	}
	if request.Kind == deploy.FaultKindPause {
		state.Reason = fmt.Sprintf("Fault %q is not supported by runtime %q. Use a Docker Compose deployment for pause faults.", request.Kind, runtimeID)
		return state
	}
	state.Reason = fmt.Sprintf("Fault %q is not supported by runtime %q.", request.Kind, runtimeID)
	return state
}

func (r *Runner) populateFaultStates(session *LabSession, lab *recipes.LabSpec, deployment *deploy.Deployment) {
	if session == nil || lab == nil {
		return
	}
	for index := range session.Steps {
		step, ok := findLabStep(lab, session.Steps[index].StepID)
		if !ok {
			continue
		}
		session.Steps[index].Fault = r.faultState(deployment, step.Fault)
	}
}

// RecoverActiveFault reverts any persisted fault for a deployment. It is safe
// to call at daemon start and before later lab operations.
func (r *Runner) RecoverActiveFault(ctx context.Context, deployment *deploy.Deployment) error {
	if deployment == nil || strings.TrimSpace(deployment.ID) == "" {
		return errors.New("deployment is required for fault recovery")
	}
	r.faultMu.Lock()
	defer r.faultMu.Unlock()

	session, found, err := r.store.Load(ctx, deployment.ID)
	if err != nil || !found || session.ActiveFault == nil {
		return err
	}
	return r.recoverSessionFault(ctx, deployment, &session)
}

func (r *Runner) recoverSessionFault(ctx context.Context, deployment *deploy.Deployment, session *LabSession) error {
	if session == nil || session.ActiveFault == nil {
		return nil
	}
	if hadRevert, err := r.faults.clear(deployment.ID); hadRevert {
		if err != nil {
			return fmt.Errorf("revert active lab fault: %w", err)
		}
		session.ActiveFault = nil
		return r.store.Save(ctx, *session)
	}

	fault, err := activeFaultToDeploy(session.ActiveFault)
	if err != nil {
		return err
	}
	recoveryDeployment := *deployment
	recoveryDeployment.Local = true
	recoveryDeployment.RuntimeID = session.ActiveFault.RuntimeID
	injector := r.faultInjector(&recoveryDeployment)
	if !deploy.Supports(injector, fault.Kind) {
		return fmt.Errorf("%w: cannot recover kind %q for runtime %q", deploy.ErrFaultUnsupported, fault.Kind, session.ActiveFault.RuntimeID)
	}
	reverter, ok := injector.(deploy.FaultReverter)
	if !ok {
		return fmt.Errorf("fault injector for runtime %q does not support restart recovery", session.ActiveFault.RuntimeID)
	}
	if err := reverter.Revert(ctx, fault); err != nil {
		return fmt.Errorf("recover active lab fault: %w", err)
	}
	session.ActiveFault = nil
	if err := r.store.Save(ctx, *session); err != nil {
		return fmt.Errorf("clear recovered lab fault journal: %w", err)
	}
	return nil
}

func (r *Runner) applyStepFault(
	ctx context.Context,
	deployment *deploy.Deployment,
	step recipes.LabStep,
	session *LabSession,
) error {
	if step.Fault == nil {
		return nil
	}
	fault, err := labFaultToDeploy(step.Fault)
	if err != nil {
		return err
	}
	injector := r.faultInjector(deployment)
	if !deploy.Supports(injector, fault.Kind) {
		return fmt.Errorf(
			"%w: kind %q is not available on this runtime (chaos faults are local-runtime only)",
			deploy.ErrFaultUnsupported,
			fault.Kind,
		)
	}
	if validator, ok := injector.(deploy.FaultValidator); ok {
		if err := validator.Validate(fault); err != nil {
			return err
		}
	}

	session.ActiveFault = &ActiveFault{
		Kind:      string(fault.Kind),
		Target:    fault.Target,
		Params:    fault.Params,
		RuntimeID: strings.TrimSpace(deployment.RuntimeID),
		StartedAt: r.timestamp(),
	}
	if err := r.store.Save(ctx, *session); err != nil {
		session.ActiveFault = nil
		return fmt.Errorf("persist active lab fault before injection: %w", err)
	}

	revert, injectErr := injector.Inject(ctx, fault)
	if injectErr != nil {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), faultCleanupTimeout)
		defer cancel()
		if recoverErr := r.recoverSessionFault(cleanupCtx, deployment, session); recoverErr != nil {
			return errors.Join(injectErr, recoverErr)
		}
		return injectErr
	}
	r.faults.add(deployment.ID, revert)
	return nil
}

func (r *Runner) clearDeploymentFaults(deployment *deploy.Deployment, session *LabSession) error {
	if deployment == nil || session == nil || session.ActiveFault == nil {
		return nil
	}
	cleanupCtx, cancel := context.WithTimeout(context.Background(), faultCleanupTimeout)
	defer cancel()
	return r.recoverSessionFault(cleanupCtx, deployment, session)
}
