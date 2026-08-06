// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package labs

import (
	"context"
	"strings"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/labs"
	"cloudsprocket/backend/daemon/internal/recipes"
)

func TestNewRegistryRegistersAllKnownVerifyTypes(t *testing.T) {
	t.Parallel()

	registry := NewRegistry(CheckDeps{})
	if registry == nil {
		t.Fatal("NewRegistry returned nil")
	}

	// Every production verify type must be registered so recipe authors get a
	// real check failure rather than "verification type is not available".
	types := []string{
		recipes.LabVerifySQSQueueAttribute,
		recipes.LabVerifyHTTPGet,
		recipes.LabVerifyHTTPUnreachable,
		recipes.LabVerifyS3Object,
		recipes.LabVerifyDynamoDBItem,
		recipes.LabVerifyLambdaInvoke,
		recipes.LabVerifyLogsContains,
		recipes.LabVerifySecretsValue,
		recipes.LabVerifySNSSubscription,
		recipes.LabVerifyAzureBlob,
		recipes.LabVerifyAzureQueueDepth,
	}

	ctx := context.Background()
	for _, verifyType := range types {
		result, err := registry.Run(ctx, recipes.LabVerify{Type: verifyType}, labs.CheckContext{})
		if err != nil {
			// Missing adapter deps may error; that still proves the check ran.
			continue
		}
		if strings.Contains(result.Message, "is not available") {
			t.Fatalf("type %q is not registered: %s", verifyType, result.Message)
		}
	}
}

func TestNewRegistryUnknownType(t *testing.T) {
	t.Parallel()

	registry := NewRegistry(CheckDeps{})
	result, err := registry.Run(context.Background(), recipes.LabVerify{Type: "not.a.real.check"}, labs.CheckContext{})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if result.Passed {
		t.Fatal("expected unknown type to fail")
	}
	if !strings.Contains(result.Message, "is not available") {
		t.Fatalf("message = %q", result.Message)
	}
}

func TestNewRunnerFromDeps(t *testing.T) {
	t.Parallel()

	store := labs.NewSessionStore(&memorySettingStore{})
	fixed := time.Date(2026, 8, 6, 12, 0, 0, 0, time.UTC)
	runner := NewRunnerFromDeps(store, CheckDeps{}, func() time.Time { return fixed })
	if runner == nil {
		t.Fatal("NewRunnerFromDeps returned nil")
	}

	// Engine is usable: Get on a missing session is a clean miss, not a panic.
	_, found, err := runner.Get(context.Background(), "missing-deployment")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if found {
		t.Fatal("expected session not found")
	}
}

func TestLazyRunnerDefersBuildUntilUse(t *testing.T) {
	t.Parallel()

	builds := 0
	lazy := NewLazyRunner(func() *labs.Runner {
		builds++
		return NewRunnerFromDeps(labs.NewSessionStore(&memorySettingStore{}), CheckDeps{}, nil)
	})
	if builds != 0 {
		t.Fatalf("build ran before first use: %d", builds)
	}
	_, found, err := lazy.Get(context.Background(), "missing")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if found {
		t.Fatal("expected session not found")
	}
	if builds != 1 {
		t.Fatalf("builds = %d, want 1", builds)
	}
	// Second call reuses the same engine.
	_, _, _ = lazy.Get(context.Background(), "missing")
	if builds != 1 {
		t.Fatalf("builds after second Get = %d, want 1", builds)
	}
}

// memorySettingStore is a minimal labs.SettingStore for runner construction tests.
type memorySettingStore struct {
	values map[string]any
}

func (m *memorySettingStore) SaveAppSetting(_ context.Context, key string, value any) error {
	if m.values == nil {
		m.values = map[string]any{}
	}
	if value == nil {
		delete(m.values, key)
		return nil
	}
	m.values[key] = value
	return nil
}

func (m *memorySettingStore) LoadAppSetting(_ context.Context, key string, target any) (bool, error) {
	if m.values == nil {
		return false, nil
	}
	_, ok := m.values[key]
	if !ok {
		return false, nil
	}
	// Tests only need found/not-found; no decode into target.
	_ = target
	return true, nil
}
