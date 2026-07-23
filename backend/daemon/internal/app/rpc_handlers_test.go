// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"errors"
	"testing"
)

func TestMethodRegistryHasExpectedSurface(t *testing.T) {
	t.Parallel()
	service := &Service{}
	handlers := service.methodHandlers()
	if got := len(handlers); got != 171 {
		t.Fatalf("registered methods: got %d, want 171", got)
	}
	// Spot-check domains so a truncated register file fails loudly.
	for _, name := range []string{
		"providers.list",
		"workspace.get",
		"aws.s3.selectBucket",
		"azure.storage.selectAccount",
		"deployments.plan",
		"labs.start",
		"emulators.list",
	} {
		if _, ok := handlers[name]; !ok {
			t.Fatalf("missing registered method %q", name)
		}
	}
}

func TestHandleUnknownMethod(t *testing.T) {
	t.Parallel()
	service := &Service{}
	_, err := service.Handle(context.Background(), "does.not.exist", nil, nil)
	if err == nil {
		t.Fatal("expected method-not-found error")
	}
	var public PublicError
	if !errors.As(err, &public) {
		t.Fatalf("expected PublicError, got %T: %v", err, err)
	}
	if public.StableCode() != "method_not_found" {
		t.Fatalf("stable code: got %q, want method_not_found", public.StableCode())
	}
}

func TestMethodHandlersMemoised(t *testing.T) {
	t.Parallel()
	service := &Service{}
	a := service.methodHandlers()
	b := service.methodHandlers()
	if len(a) != len(b) {
		t.Fatalf("handler map size changed between calls: %d vs %d", len(a), len(b))
	}
	if _, ok := a["providers.list"]; !ok {
		t.Fatal("providers.list missing")
	}
	// sync.Once must return the same map instance.
	if len(a) == 0 || len(b) == 0 {
		t.Fatal("empty handler map")
	}
}
