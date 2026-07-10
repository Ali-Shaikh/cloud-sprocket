// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package labs

import (
	"context"
	"fmt"
	"sync"

	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/recipes"
)

// faultTracker holds live revert functions for active chaos faults per deployment.
// Reverts are not persisted; a daemon restart leaves containers running until
// the operator unpauses them (documented in A6; a restart sweep is follow-up).
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

func (t *faultTracker) clear(deploymentID string) error {
	if t == nil || deploymentID == "" {
		return nil
	}
	t.mu.Lock()
	list := t.reverts[deploymentID]
	delete(t.reverts, deploymentID)
	t.mu.Unlock()

	var first error
	// Revert newest first.
	for i := len(list) - 1; i >= 0; i-- {
		if err := list[i](); err != nil && first == nil {
			first = err
		}
	}
	return first
}

func labFaultToDeploy(fault *recipes.LabFault) (deploy.Fault, error) {
	if fault == nil {
		return deploy.Fault{}, fmt.Errorf("fault is required")
	}
	kind := deploy.FaultKind(fault.Kind)
	if kind == "" {
		return deploy.Fault{}, fmt.Errorf("fault kind is required")
	}
	return deploy.Fault{
		Kind:   kind,
		Target: fault.Target,
		Params: fault.Params,
	}, nil
}

// applyStepFault injects a step fault when declared. Returns a message for the
// UI when injection is skipped (no fault) or applied.
func (r *Runner) applyStepFault(
	ctx context.Context,
	deployment *deploy.Deployment,
	step recipes.LabStep,
) error {
	if step.Fault == nil {
		return nil
	}
	fault, err := labFaultToDeploy(step.Fault)
	if err != nil {
		return err
	}
	injector := r.injectorFor(deployment)
	if injector == nil {
		injector = deploy.FaultInjectorForDeployment(deployment)
	}
	if !deploy.Supports(injector, fault.Kind) {
		return fmt.Errorf(
			"%w: kind %q is not available on this runtime (chaos faults are local-runtime only)",
			deploy.ErrFaultUnsupported,
			fault.Kind,
		)
	}
	// Drop any previous faults for this deployment before applying the step's.
	_ = r.faults.clear(deployment.ID)
	revert, err := injector.Inject(ctx, fault)
	if err != nil {
		return err
	}
	r.faults.add(deployment.ID, revert)
	return nil
}

func (r *Runner) clearDeploymentFaults(deploymentID string) error {
	if r.faults == nil {
		return nil
	}
	return r.faults.clear(deploymentID)
}
