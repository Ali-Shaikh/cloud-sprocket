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

func TestResolveRuntimeIDDefaults(t *testing.T) {
	cases := []struct {
		name string
		dep  Deployment
		want string
	}{
		{"local aws defaults localstack", Deployment{ProviderID: "aws", Local: true}, "localstack"},
		{"cloud aws defaults aws-cloud", Deployment{ProviderID: "aws", ProfileID: "prod"}, "aws-cloud"},
		{"explicit runtime", Deployment{ProviderID: "aws", Local: true, RuntimeID: "docker-compose"}, "docker-compose"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := resolveRuntimeID(&tc.dep); got != tc.want {
				t.Fatalf("resolveRuntimeID() = %q, want %q", got, tc.want)
			}
		})
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
		{"docker-compose", Deployment{ProviderID: "aws", Local: true, RuntimeID: "docker-compose"}, "docker-compose"},
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
	if err := engine.Preflight(context.Background(), deployment); err != nil {
		t.Fatalf("stub preflight should be no-op: %v", err)
	}
	if label := engine.TargetLabel(deployment); label != "Docker Compose" {
		t.Fatalf("TargetLabel = %q, want Docker Compose", label)
	}
}