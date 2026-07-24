// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/recipes"
	"cloudsprocket/backend/daemon/internal/tofu"
)

func TestResolveRuntimeIDDefaults(t *testing.T) {
	cases := []struct {
		name string
		dep  Deployment
		want string
	}{
		{"local aws defaults localstack", Deployment{ProviderID: "aws", Local: true}, "localstack"},
		{"local azure defaults floci-az", Deployment{ProviderID: "azure", Local: true}, "floci-az"},
		{"cloud aws defaults aws-cloud", Deployment{ProviderID: "aws", ProfileID: "prod"}, "aws-cloud"},
		{"cloud azure defaults azure-cloud", Deployment{ProviderID: "azure", ProfileID: "sub-001"}, "azure-cloud"},
		{"explicit runtime", Deployment{ProviderID: "aws", Local: true, RuntimeID: "docker-compose"}, "docker-compose"},
		// A non-cloud provider without an explicit runtime is target-less: it must
		// not fall through to LocalStack and silently redirect the deployment.
		{"local non-cloud has no default", Deployment{ProviderID: "fly", Local: true}, ""},
		{"cloud non-cloud has no default", Deployment{ProviderID: "fly", ProfileID: "p"}, ""},
		{"unset provider has no default", Deployment{}, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := resolveRuntimeID(&tc.dep); got != tc.want {
				t.Fatalf("resolveRuntimeID() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestResolveTarget(t *testing.T) {
	registry := NewRegistry(config.Settings{}, TargetOptions{})

	// A target-less deployment resolves to (nil, nil), not an error.
	target, err := registry.ResolveTarget(&Deployment{ProviderID: "fly", Local: true})
	if err != nil {
		t.Fatalf("target-less ResolveTarget should not error, got %v", err)
	}
	if target != nil {
		t.Fatalf("target-less ResolveTarget should be nil, got %q", target.ID())
	}

	// An explicit but unknown runtime is an error callers must surface.
	if _, err := registry.ResolveTarget(&Deployment{ProviderID: "aws", Local: true, RuntimeID: "nope"}); err == nil {
		t.Fatal("expected an unknown runtime to error")
	}

	// A cloud default still resolves a concrete target.
	target, err = registry.ResolveTarget(&Deployment{ProviderID: "aws", Local: true})
	if err != nil || target == nil || target.ID() != "localstack" {
		t.Fatalf("aws local ResolveTarget = (%v, %v), want localstack", target, err)
	}
}

func TestEngineSkipsTargetlessDeployment(t *testing.T) {
	settings := config.Settings{ConfigDir: t.TempDir(), DeploymentsDir: t.TempDir()}
	engine := NewEngine(tofu.NewRunner("tofu"), settings, recipes.Bundled())
	deployment := &Deployment{ID: "dep-targetless", ProviderID: "fly", Local: true}

	// Preflight, env, and label all degrade gracefully without a target.
	if err := engine.Preflight(context.Background(), deployment); err != nil {
		t.Fatalf("target-less Preflight should be a no-op, got %v", err)
	}
	if env := engine.env(deployment); !envContainsKey(env, "TF_PLUGIN_CACHE_DIR", "plugin-cache") {
		t.Fatalf("target-less env should still set TF_PLUGIN_CACHE_DIR, got %v", env)
	}
	if label := engine.TargetLabel(deployment); label != "local emulator" {
		t.Fatalf("target-less TargetLabel = %q, want local emulator", label)
	}
}

func TestRegistryResolvesBuiltInTargets(t *testing.T) {
	registry := NewRegistry(config.Settings{}, TargetOptions{})
	cases := []struct {
		name     string
		dep      Deployment
		targetID string
	}{
		{"localstack", Deployment{ProviderID: "aws", Local: true}, "localstack"},
		{"aws-cloud", Deployment{ProviderID: "aws", ProfileID: "prod"}, "aws-cloud"},
		{"azure-cloud", Deployment{ProviderID: "azure", ProfileID: "sub-001"}, "azure-cloud"},
		{"docker-compose", Deployment{ProviderID: "aws", Local: true, RuntimeID: "docker-compose"}, "docker-compose"},
		{"magento-compose", Deployment{ProviderID: "aws", Local: true, RuntimeID: "magento-compose"}, "magento-compose"},
		{"floci-az", Deployment{ProviderID: "azure", Local: true, RuntimeID: "floci-az"}, "floci-az"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			target, err := registry.Resolve(&tc.dep)
			if err != nil {
				t.Fatalf("Resolve: %v", err)
			}
			if target.ID() != tc.targetID {
				t.Fatalf("target ID = %q, want %q", target.ID(), tc.targetID)
			}
		})
	}
}

func TestStubTargetRegistersWithoutEngineEdits(t *testing.T) {
	settings := config.Settings{DeploymentsDir: t.TempDir()}
	engine := NewEngine(tofu.NewRunner("tofu"), settings, recipes.Bundled())
	engine.registry.Register("docker-compose", &dockerComposeStubTarget{})

	deployment := &Deployment{
		ID:         "dep-stub",
		RecipeID:   "serverless-fullstack-aws",
		ProviderID: "aws",
		Local:      true,
		RuntimeID:  "docker-compose",
		Variables:  map[string]any{"app_name": "demo"},
	}
	if err := engine.Prepare(deployment); err != nil {
		t.Fatalf("Prepare with stub target: %v", err)
	}
	dir := engine.WorkspaceDir("dep-stub")
	if _, err := os.Stat(filepath.Join(dir, overrideFile)); err == nil {
		t.Fatal("stub target should not write a LocalStack override file")
	}
	// Recipe compat is tested elsewhere; here we only verify a registered stub target preflights.
	if err := engine.Preflight(context.Background(), &Deployment{
		ProviderID: deployment.ProviderID,
		Local:      deployment.Local,
		RuntimeID:  deployment.RuntimeID,
	}); err != nil {
		t.Fatalf("stub preflight should be no-op: %v", err)
	}
	if label := engine.TargetLabel(deployment); label != "Docker Compose" {
		t.Fatalf("TargetLabel = %q, want Docker Compose", label)
	}
}

func TestRegistryConcurrentRegisterAndResolve(t *testing.T) {
	registry := NewRegistry(config.Settings{}, TargetOptions{})
	const workers = 32
	const iterations = 50

	var wg sync.WaitGroup
	wg.Add(workers * 2)
	for i := 0; i < workers; i++ {
		i := i
		go func() {
			defer wg.Done()
			for n := 0; n < iterations; n++ {
				id := fmt.Sprintf("custom-%d", i)
				registry.Register(id, &dockerComposeStubTarget{})
				registry.RegisterFactory(id+"-factory", func(config.Settings, TargetOptions) Target {
					return &dockerComposeStubTarget{}
				})
				registry.SetOptions(TargetOptions{
					LocalStackEndpoint: fmt.Sprintf("http://127.0.0.1:%d", 4500+i),
				})
			}
		}()
		go func() {
			defer wg.Done()
			for n := 0; n < iterations; n++ {
				if _, err := registry.Resolve(&Deployment{ProviderID: "aws", Local: true}); err != nil {
					t.Errorf("Resolve localstack: %v", err)
					return
				}
				if _, err := registry.Resolve(&Deployment{
					ProviderID: "aws",
					Local:      true,
					RuntimeID:  fmt.Sprintf("custom-%d", i),
				}); err != nil {
					// Registration may not have completed yet; that is fine for the race test.
					_ = err
				}
			}
		}()
	}
	wg.Wait()
}