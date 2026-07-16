// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"context"
	"errors"
	"sync"
	"testing"
)

type recordingContainers struct {
	mu       sync.Mutex
	paused   []string
	unpaused []string
	pauseErr error
}

func (r *recordingContainers) Pause(_ context.Context, name string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.pauseErr != nil {
		return r.pauseErr
	}
	r.paused = append(r.paused, name)
	return nil
}

func (r *recordingContainers) Unpause(_ context.Context, name string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.unpaused = append(r.unpaused, name)
	return nil
}

func TestNoopFaultInjectorRejectsAllKinds(t *testing.T) {
	t.Parallel()
	injector := NoopFaultInjector{}
	caps := injector.Capabilities()
	if caps == nil {
		t.Fatal("noop capabilities must be non-nil for stable JSON encoding")
	}
	if len(caps) != 0 {
		t.Fatalf("noop capabilities: got %v, want empty", caps)
	}
	revert, err := injector.Inject(context.Background(), Fault{Kind: FaultKindLatency, Target: "api"})
	if !errors.Is(err, ErrFaultUnsupported) {
		t.Fatalf("inject: got %v, want ErrFaultUnsupported", err)
	}
	if revert != nil {
		t.Fatal("failed inject must return nil revert")
	}
}

func TestComposeFaultInjectorPauseAndRevert(t *testing.T) {
	t.Parallel()
	containers := &recordingContainers{}
	injector := NewComposeFaultInjector(containers)

	if !Supports(injector, FaultKind(" pause ")) {
		t.Fatal("expected Supports to normalise fault kind whitespace")
	}

	revert, err := injector.Inject(context.Background(), Fault{Kind: FaultKindPause, Target: "worker"})
	if err != nil {
		t.Fatalf("inject pause: %v", err)
	}
	if revert == nil {
		t.Fatal("expected non-nil revert on success")
	}
	if len(containers.paused) != 1 || containers.paused[0] != "worker" {
		t.Fatalf("paused = %v, want [worker]", containers.paused)
	}
	if err := revert(); err != nil {
		t.Fatalf("revert: %v", err)
	}
	if err := revert(); err != nil {
		t.Fatalf("second revert should be idempotent: %v", err)
	}
	if len(containers.unpaused) != 1 || containers.unpaused[0] != "worker" {
		t.Fatalf("unpaused = %v, want [worker] once", containers.unpaused)
	}
}

func TestComposeFaultInjectorCapabilitiesOnlyPause(t *testing.T) {
	t.Parallel()
	injector := NewComposeFaultInjector(&recordingContainers{})
	caps := injector.Capabilities()
	if len(caps) != 1 || caps[0] != FaultKindPause {
		t.Fatalf("capabilities = %v, want [pause] only", caps)
	}
	for _, planned := range PlannedFaultKinds() {
		if Supports(injector, planned) {
			t.Fatalf("%s must not be advertised until its inject backend is wired", planned)
		}
		_, err := injector.Inject(context.Background(), Fault{Kind: planned, Target: "api"})
		if !errors.Is(err, ErrFaultUnsupported) {
			t.Fatalf("%s inject: got %v, want ErrFaultUnsupported", planned, err)
		}
	}
	planned := PlannedFaultKinds()
	if len(planned) != 3 {
		t.Fatalf("PlannedFaultKinds = %v, want latency/partition/service-error", planned)
	}
}

func TestFaultInjectorForTargetAndDeployment(t *testing.T) {
	t.Parallel()
	cases := []struct {
		targetID string
		compose  bool
	}{
		{targetID: "docker-compose", compose: true},
		{targetID: "magento-compose", compose: false},
		{targetID: "localstack", compose: false},
		{targetID: "aws-cloud", compose: false},
	}
	for _, tc := range cases {
		injector := FaultInjectorForTarget(tc.targetID)
		_, isCompose := injector.(ComposeFaultInjector)
		if isCompose != tc.compose {
			t.Fatalf("target %s: compose=%v want %v", tc.targetID, isCompose, tc.compose)
		}
	}

	cloud := FaultInjectorForDeployment(&Deployment{Local: false, RuntimeID: "aws-cloud"})
	if _, ok := cloud.(NoopFaultInjector); !ok {
		t.Fatalf("cloud deployment should be noop, got %T", cloud)
	}
	compose := FaultInjectorForDeployment(&Deployment{Local: true, RuntimeID: "docker-compose"})
	if _, ok := compose.(ComposeFaultInjector); !ok {
		t.Fatalf("compose deployment should use compose injector, got %T", compose)
	}
}

func TestManagedComposeInjectorRejectsUnownedTargets(t *testing.T) {
	t.Parallel()
	injector := FaultInjectorForTarget("docker-compose")
	validator, ok := injector.(FaultValidator)
	if !ok {
		t.Fatalf("managed compose injector should validate targets, got %T", injector)
	}
	allowed := Fault{Kind: FaultKindPause, Target: dockerComposeLocalStackContainerName}
	if err := validator.Validate(allowed); err != nil {
		t.Fatalf("managed target rejected: %v", err)
	}
	err := validator.Validate(Fault{Kind: FaultKindPause, Target: "unrelated-database"})
	if !errors.Is(err, ErrFaultTargetNotAllowed) {
		t.Fatalf("got %v, want ErrFaultTargetNotAllowed", err)
	}
}
