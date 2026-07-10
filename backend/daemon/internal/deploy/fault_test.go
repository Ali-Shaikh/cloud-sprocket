// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"context"
	"errors"
	"testing"
)

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

func TestComposeFaultInjectorAdvertisesKinds(t *testing.T) {
	t.Parallel()
	injector := ComposeFaultInjector{}
	for _, kind := range []FaultKind{
		FaultKindLatency,
		FaultKindPartition,
		FaultKindPause,
		FaultKindServiceError,
	} {
		if !Supports(injector, kind) {
			t.Fatalf("expected support for %s", kind)
		}
	}
	// Whitespace around kind should still match advertised capabilities.
	if !Supports(injector, FaultKind(" pause ")) {
		t.Fatal("expected Supports to normalise fault kind whitespace")
	}
	revert, err := injector.Inject(context.Background(), Fault{Kind: FaultKindPause, Target: "worker"})
	if err == nil {
		t.Fatal("expected not-wired error until chaos labs implement inject")
	}
	if !errors.Is(err, ErrFaultNotImplemented) {
		t.Fatalf("got %v, want ErrFaultNotImplemented", err)
	}
	if errors.Is(err, ErrFaultUnsupported) {
		t.Fatalf("supported kind should not return ErrFaultUnsupported: %v", err)
	}
	if revert != nil {
		t.Fatal("failed inject must return nil revert")
	}
}

func TestFaultInjectorForTarget(t *testing.T) {
	t.Parallel()
	cases := []struct {
		targetID string
		compose  bool
	}{
		{targetID: "docker-compose", compose: true},
		{targetID: "magento-compose", compose: true},
		{targetID: "localstack", compose: false},
		{targetID: "aws-cloud", compose: false},
		{targetID: "azure-cloud", compose: false},
		{targetID: "floci-az", compose: false},
	}
	for _, tc := range cases {
		injector := FaultInjectorForTarget(tc.targetID)
		_, isCompose := injector.(ComposeFaultInjector)
		if isCompose != tc.compose {
			t.Fatalf("target %s: compose=%v want %v", tc.targetID, isCompose, tc.compose)
		}
	}
}
