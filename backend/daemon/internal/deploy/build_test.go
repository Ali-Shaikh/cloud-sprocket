package deploy

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/recipes"
	"cloudsprocket/backend/daemon/internal/tofu"
)

func okCommand() []string {
	if runtime.GOOS == "windows" {
		return []string{"cmd", "/c", "echo", "built"}
	}
	return []string{"sh", "-c", "echo built"}
}

func failCommand() []string {
	if runtime.GOOS == "windows" {
		return []string{"cmd", "/c", "exit 1"}
	}
	return []string{"sh", "-c", "exit 1"}
}

func newBuildEngine(t *testing.T) *Engine {
	t.Helper()
	return NewEngine(tofu.NewRunner("tofu"), config.Settings{DeploymentsDir: t.TempDir()}, recipes.Bundled())
}

func TestRunBuildStepsRunsWhenRequiresPresent(t *testing.T) {
	engine := newBuildEngine(t)
	srcDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(srcDir, "package.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	deployment := &Deployment{ID: "d1", Variables: map[string]any{"backend_source_dir": srcDir}}
	steps := []recipes.BuildStep{{Name: "build", DirVar: "backend_source_dir", Requires: "package.json", Command: okCommand()}}

	var lines []string
	if err := engine.runBuildSteps(context.Background(), deployment, steps, func(l string) { lines = append(lines, l) }); err != nil {
		t.Fatalf("runBuildSteps: %v", err)
	}
	if len(lines) == 0 {
		t.Fatal("expected build output to be streamed")
	}
}

func TestRunBuildStepsSkipsWhenRequiresMissing(t *testing.T) {
	engine := newBuildEngine(t)
	srcDir := t.TempDir() // no package.json
	deployment := &Deployment{ID: "d2", Variables: map[string]any{"backend_source_dir": srcDir}}
	steps := []recipes.BuildStep{{Name: "build", DirVar: "backend_source_dir", Requires: "package.json", Command: failCommand()}}

	// The step must be skipped (not run), so the failing command never executes.
	if err := engine.runBuildSteps(context.Background(), deployment, steps, nil); err != nil {
		t.Fatalf("expected skip, got error: %v", err)
	}
}

func TestRunBuildStepsSkipsWhenDirVarEmpty(t *testing.T) {
	engine := newBuildEngine(t)
	deployment := &Deployment{ID: "d3", Variables: map[string]any{}}
	steps := []recipes.BuildStep{{Name: "build", DirVar: "backend_source_dir", Command: failCommand()}}
	if err := engine.runBuildSteps(context.Background(), deployment, steps, nil); err != nil {
		t.Fatalf("expected skip, got error: %v", err)
	}
}

func TestRunBuildStepsReturnsErrorOnFailure(t *testing.T) {
	engine := newBuildEngine(t)
	srcDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(srcDir, "package.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	deployment := &Deployment{ID: "d4", Variables: map[string]any{"backend_source_dir": srcDir}}
	steps := []recipes.BuildStep{{Name: "build", DirVar: "backend_source_dir", Requires: "package.json", Command: failCommand()}}
	if err := engine.runBuildSteps(context.Background(), deployment, steps, nil); err == nil {
		t.Fatal("expected an error from the failing build step")
	}
}
