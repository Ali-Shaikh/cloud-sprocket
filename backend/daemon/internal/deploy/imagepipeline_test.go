// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/recipes"
)

func TestSanitiseECRRepoName(t *testing.T) {
	if got := sanitiseECRRepoName("My_App/Prod"); got != "my-app-prod" {
		t.Fatalf("sanitiseECRRepoName = %q", got)
	}
	if got := sanitiseECRRepoName(""); got != "cloudsprocket-app" {
		t.Fatalf("empty sanitise = %q", got)
	}
}

func TestImageRepositoryNameFromVariables(t *testing.T) {
	deployment := &Deployment{
		Variables: map[string]any{
			"app_name":    "billing",
			"environment": "staging",
		},
	}
	spec := &recipes.ImageBuildSpec{}
	if got := imageRepositoryName(deployment, spec); got != "billing-staging-api" {
		t.Fatalf("repo name = %q", got)
	}
}

func TestRunImagePipelineSkipsWithoutDockerfile(t *testing.T) {
	engine := NewEngine(nil, imagePipelineSettings(t), recipes.Bundled())
	deployment := &Deployment{
		ID:         "img-skip",
		RecipeID:   "api-postgres-containers-aws",
		Variables:  map[string]any{"dockerfile_dir": t.TempDir()},
		ProviderID: "aws",
		Local:      true,
	}
	if err := engine.Prepare(deployment); err != nil {
		t.Fatalf("Prepare: %v", err)
	}
	spec := &recipes.ImageBuildSpec{DockerfileDirVar: "dockerfile_dir", ImageVar: "container_image"}
	if err := engine.runImagePipeline(t.Context(), deployment, spec, nil); err != nil {
		t.Fatalf("runImagePipeline: %v", err)
	}
	if _, ok := deployment.Variables["container_image"]; ok {
		t.Fatal("expected container_image to remain unset when Dockerfile is absent")
	}
}

func imagePipelineSettings(t *testing.T) config.Settings {
	t.Helper()
	return config.Settings{DeploymentsDir: t.TempDir()}
}