package deploy

import (
	"context"
	"os"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/recipes"
	"cloudsprocket/backend/daemon/internal/tofu"
)

// TestLivePlanBundledRecipe installs the real OpenTofu, prepares the bundled
// serverless recipe as a local deployment, and runs init+plan, asserting the
// parsed diff. Gated behind TOFU_LIVE (downloads tofu + the AWS/archive
// providers). It does not need LocalStack running: the generated override sets
// the provider to skip credential/account checks, so plan computes the create
// diff offline.
func TestLivePlanBundledRecipe(t *testing.T) {
	if os.Getenv("TOFU_LIVE") == "" {
		t.Skip("set TOFU_LIVE=1 to run a real tofu init+plan")
	}
	ctx := context.Background()

	path, err := tofu.NewInstaller(t.TempDir()).Ensure(ctx)
	if err != nil {
		t.Fatalf("install tofu: %v", err)
	}
	engine := NewEngine(tofu.NewRunner(path), config.Settings{DeploymentsDir: t.TempDir()}, recipes.Bundled())

	deployment := &Deployment{
		ID:         "live",
		RecipeID:   "serverless-fullstack-aws",
		ProviderID: "aws",
		Local:      true,
		Variables:  map[string]any{"app_name": "livedemo", "environment": "dev"},
	}
	if err := engine.Prepare(deployment); err != nil {
		t.Fatalf("Prepare: %v", err)
	}

	summary, err := engine.Plan(ctx, deployment, func(line string) { t.Log(line) })
	if err != nil {
		t.Fatalf("Plan: %v", err)
	}
	t.Logf("plan summary: +%d ~%d -%d (%d changes)", summary.Add, summary.Change, summary.Destroy, len(summary.Changes))
	if summary.Add == 0 {
		t.Fatal("expected the plan to add resources")
	}
}

// TestLivePlanContainerRecipe validates the traditional ECS/RDS/CloudFront recipe
// plans cleanly. Gated behind TOFU_LIVE. Plans offline (no AWS data sources).
func TestLivePlanContainerRecipe(t *testing.T) {
	if os.Getenv("TOFU_LIVE") == "" {
		t.Skip("set TOFU_LIVE=1 to run a real tofu init+plan")
	}
	ctx := context.Background()

	path, err := tofu.NewInstaller(t.TempDir()).Ensure(ctx)
	if err != nil {
		t.Fatalf("install tofu: %v", err)
	}
	engine := NewEngine(tofu.NewRunner(path), config.Settings{DeploymentsDir: t.TempDir()}, recipes.Bundled())

	deployment := &Deployment{
		ID:         "live-container",
		RecipeID:   "container-fullstack-aws",
		ProviderID: "aws",
		Local:      true,
		Variables:  map[string]any{"app_name": "livedemo", "environment": "dev", "db_password": "supersecret123"},
	}
	if err := engine.Prepare(deployment); err != nil {
		t.Fatalf("Prepare: %v", err)
	}
	summary, err := engine.Plan(ctx, deployment, func(line string) { t.Log(line) })
	if err != nil {
		t.Fatalf("Plan: %v", err)
	}
	t.Logf("container plan summary: +%d ~%d -%d", summary.Add, summary.Change, summary.Destroy)
	if summary.Add == 0 {
		t.Fatal("expected the container plan to add resources")
	}
}

// TestLivePlanStaticSiteRecipe validates the free-tier S3 static-site recipe
// plans cleanly. Gated behind TOFU_LIVE. Plans offline (no AWS data sources).
func TestLivePlanStaticSiteRecipe(t *testing.T) {
	if os.Getenv("TOFU_LIVE") == "" {
		t.Skip("set TOFU_LIVE=1 to run a real tofu init+plan")
	}
	ctx := context.Background()

	path, err := tofu.NewInstaller(t.TempDir()).Ensure(ctx)
	if err != nil {
		t.Fatalf("install tofu: %v", err)
	}
	engine := NewEngine(tofu.NewRunner(path), config.Settings{DeploymentsDir: t.TempDir()}, recipes.Bundled())

	deployment := &Deployment{
		ID:         "live-static",
		RecipeID:   "static-site-aws",
		ProviderID: "aws",
		Local:      true,
		Variables:  map[string]any{"app_name": "livesite", "environment": "dev"},
	}
	if err := engine.Prepare(deployment); err != nil {
		t.Fatalf("Prepare: %v", err)
	}
	summary, err := engine.Plan(ctx, deployment, func(line string) { t.Log(line) })
	if err != nil {
		t.Fatalf("Plan: %v", err)
	}
	t.Logf("static-site plan summary: +%d ~%d -%d", summary.Add, summary.Change, summary.Destroy)
	if summary.Add == 0 {
		t.Fatal("expected the static-site plan to add resources")
	}
}

// TestLivePlanScheduledJobRecipe validates the free-tier EventBridge + Lambda
// recipe plans cleanly. Gated behind TOFU_LIVE. Plans offline (no AWS data
// sources).
func TestLivePlanScheduledJobRecipe(t *testing.T) {
	if os.Getenv("TOFU_LIVE") == "" {
		t.Skip("set TOFU_LIVE=1 to run a real tofu init+plan")
	}
	ctx := context.Background()

	path, err := tofu.NewInstaller(t.TempDir()).Ensure(ctx)
	if err != nil {
		t.Fatalf("install tofu: %v", err)
	}
	engine := NewEngine(tofu.NewRunner(path), config.Settings{DeploymentsDir: t.TempDir()}, recipes.Bundled())

	deployment := &Deployment{
		ID:         "live-scheduled",
		RecipeID:   "scheduled-job-aws",
		ProviderID: "aws",
		Local:      true,
		Variables:  map[string]any{"app_name": "livejob", "environment": "dev"},
	}
	if err := engine.Prepare(deployment); err != nil {
		t.Fatalf("Prepare: %v", err)
	}
	summary, err := engine.Plan(ctx, deployment, func(line string) { t.Log(line) })
	if err != nil {
		t.Fatalf("Plan: %v", err)
	}
	t.Logf("scheduled-job plan summary: +%d ~%d -%d", summary.Add, summary.Change, summary.Destroy)
	if summary.Add == 0 {
		t.Fatal("expected the scheduled-job plan to add resources")
	}
}
