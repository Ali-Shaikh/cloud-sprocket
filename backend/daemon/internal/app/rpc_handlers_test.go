// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
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
	// sync.Once must return the same map instance: mutate through one reference.
	sentinel := RPCHandler(func(context.Context, json.RawMessage, Notifier) (any, error) {
		return "memo-test", nil
	})
	a["__memo_identity_probe__"] = sentinel
	got, ok := b["__memo_identity_probe__"]
	if !ok {
		t.Fatal("methodHandlers returned a different map on second call")
	}
	delete(a, "__memo_identity_probe__")
	if _, still := b["__memo_identity_probe__"]; still {
		t.Fatal("probe key still present after delete on shared map")
	}
	_ = got
}

func TestRegisteredMethodsSorted(t *testing.T) {
	t.Parallel()
	service := &Service{}
	names := service.RegisteredMethods()
	if len(names) != 171 {
		t.Fatalf("RegisteredMethods length: got %d, want 171", len(names))
	}
	for i := 1; i < len(names); i++ {
		if names[i-1] >= names[i] {
			t.Fatalf("RegisteredMethods not sorted at %d: %q then %q", i, names[i-1], names[i])
		}
	}
}
