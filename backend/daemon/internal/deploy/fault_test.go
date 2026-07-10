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
	if len(injector.Capabilities()) != 0 {
		t.Fatalf("noop capabilities: got %v, want empty", injector.Capabilities())
	}
	_, err := injector.Inject(context.Background(), Fault{Kind: FaultKindLatency, Target: "api"})
	if !errors.Is(err, ErrFaultUnsupported) {
		t.Fatalf("inject: got %v, want ErrFaultUnsupported", err)
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
	_, err := injector.Inject(context.Background(), Fault{Kind: FaultKindPause, Target: "worker"})
	if err == nil {
		t.Fatal("expected not-wired error until chaos labs implement inject")
	}
	if errors.Is(err, ErrFaultUnsupported) {
		t.Fatalf("supported kind should not return ErrFaultUnsupported: %v", err)
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
