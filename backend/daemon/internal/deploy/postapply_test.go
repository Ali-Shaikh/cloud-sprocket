// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/recipes"
	"cloudsprocket/backend/daemon/internal/tofu"
)

func TestRetryPostApplyRequiresOutputs(t *testing.T) {
	engine := NewEngine(tofu.NewRunner("false"), config.Settings{DeploymentsDir: t.TempDir()}, recipes.Bundled())
	deployment := &Deployment{
		ID:       "dep-retry",
		RecipeID: "api-postgres-serverless-aws",
		Status:   StatusApplied,
		PostApplyError: "previous failure",
	}
	err := engine.RetryPostApply(context.Background(), deployment, nil)
	if err == nil {
		t.Fatal("expected retry to fail without stored outputs")
	}
}

func TestRetryPostApplyRejectsRecipeWithoutSteps(t *testing.T) {
	engine := NewEngine(tofu.NewRunner("false"), config.Settings{DeploymentsDir: t.TempDir()}, recipes.Bundled())
	deployment := &Deployment{
		ID:       "dep-retry",
		RecipeID: "api-dynamodb-serverless-aws",
		Status:   StatusApplied,
		Outputs: []Output{{Name: "api_endpoint", Value: "http://example"}},
		PostApplyError: "previous failure",
	}
	err := engine.RetryPostApply(context.Background(), deployment, nil)
	if err == nil {
		t.Fatal("expected retry to fail when recipe has no postApply steps")
	}
}

func TestPostApplyFailureDoesNotUseContinueOnErrorByDefault(t *testing.T) {
	dir := t.TempDir()
	sampleDir := filepath.Join(dir, "sample")
	if err := os.MkdirAll(sampleDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(sampleDir, "package.json"), []byte(`{"name":"x"}`), 0o644); err != nil {
		t.Fatalf("write package.json: %v", err)
	}

	engine := NewEngine(tofu.NewRunner("false"), config.Settings{DeploymentsDir: dir}, recipes.Bundled())
	deployment := &Deployment{
		ID:       "dep",
		RecipeID: "api-postgres-serverless-aws",
		Variables: map[string]any{
			"backend_source_dir": sampleDir,
		},
	}
	steps := []recipes.BuildStep{{
		Name:     "Run migrations",
		DirVar:   "backend_source_dir",
		Requires: "package.json",
		Command:  []string{"false"},
	}}
	err := engine.runBuildSteps(context.Background(), deployment, steps, []string{"DATABASE_URL=postgres://demo"}, nil)
	if err == nil {
		t.Fatal("expected post-apply step failure")
	}
}