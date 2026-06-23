// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Package deploy orchestrates recipe deployments through the OpenTofu engine:
// it prepares a per-deployment workspace (materialised recipe + tfvars + an
// optional LocalStack endpoint override), then runs init/plan/apply/destroy and
// parses the results into structured diffs and outputs.
package deploy

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/recipes"
	"cloudsprocket/backend/daemon/internal/sysproc"
	"cloudsprocket/backend/daemon/internal/tofu"
)

// Status is the lifecycle state of a deployment.
type Status string

const (
	StatusPending    Status = "pending"
	StatusPlanning   Status = "planning"
	StatusPlanned    Status = "planned"
	StatusApplying   Status = "applying"
	StatusApplied    Status = "applied"
	StatusDestroying Status = "destroying"
	StatusDestroyed  Status = "destroyed"
	StatusFailed     Status = "failed"
	StatusCancelled  Status = "cancelled"
)

// Deployment is one instantiation of a recipe against a connection profile.
type Deployment struct {
	ID         string         `json:"id"`
	RecipeID   string         `json:"recipeId"`
	Name       string         `json:"name"`
	ProviderID string         `json:"providerId"`
	ProfileID  string         `json:"profileId"`
	Local      bool           `json:"local"`
	// RuntimeID names the local emulator when Local is true (e.g. "localstack").
	// Empty means the default for the provider (localstack for local AWS).
	RuntimeID  string         `json:"runtimeId,omitempty"`
	Variables  map[string]any `json:"variables"`
	Status     Status         `json:"status"`
	Plan       *PlanSummary   `json:"plan,omitempty"`
	Outputs    []Output       `json:"outputs,omitempty"`
	// SensitiveVars names the variables whose values are secret (from the
	// recipe), so they can be sealed at rest in the persisted record.
	SensitiveVars []string `json:"sensitiveVars,omitempty"`
	Error          string `json:"error,omitempty"`
	// PostApplyError is set when infrastructure applied successfully but a
	// post-apply build step failed (e.g. database migrations). The deployment
	// stays in StatusApplied so outputs remain usable and steps can be retried.
	PostApplyError string `json:"postApplyError,omitempty"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

// ApplyResult is the outcome of a successful tofu apply. PostApplyError is
// non-empty when infra landed but a post-apply step failed.
type ApplyResult struct {
	Outputs        []Output
	PostApplyError string
}

// Output is a resolved Terraform output value.
type Output struct {
	Name      string `json:"name"`
	Value     any    `json:"value"`
	Sensitive bool   `json:"sensitive,omitempty"`
}

// ResourceChange is a single planned resource action.
type ResourceChange struct {
	Address string   `json:"address"`
	Type    string   `json:"type"`
	Name    string   `json:"name"`
	Actions []string `json:"actions"`
}

// PlanSummary is the parsed result of `tofu show -json` of a plan.
type PlanSummary struct {
	Add     int              `json:"add"`
	Change  int              `json:"change"`
	Destroy int              `json:"destroy"`
	Changes []ResourceChange `json:"changes"`
}

const (
	tfvarsFile    = "cloudsprocket.auto.tfvars.json"
	overrideFile = "cloudsprocket_localstack_override.tf"
	planFile     = "cloudsprocket.tfplan"
)

// Engine runs deployments via a tofu runner.
type Engine struct {
	runner   *tofu.Runner
	settings config.Settings
	loader   *recipes.Loader
	registry *Registry
}

// NewEngine builds an engine bound to a runner, settings and recipe loader.
// The runner may be unresolved; it is (re)resolved lazily and on install.
func NewEngine(runner *tofu.Runner, settings config.Settings, loader *recipes.Loader) *Engine {
	return &Engine{
		runner:   runner,
		settings: settings,
		loader:   loader,
		registry: NewRegistry(settings, TargetOptions{LocalStackEndpoint: DefaultLocalStackEndpoint}),
	}
}

// ensureRunner resolves a tofu binary from settings if one is not yet usable.
func (e *Engine) ensureRunner() {
	if e.runner != nil && e.runner.Available() {
		return
	}
	if path := tofu.Resolve(e.settings); path != "" {
		e.runner = tofu.NewRunner(path)
	}
}

// Available reports whether a tofu binary is resolvable.
func (e *Engine) Available() bool {
	e.ensureRunner()
	return e.runner != nil && e.runner.Available()
}

// Version returns the resolved tofu version, or empty when unavailable.
func (e *Engine) Version(ctx context.Context) (string, error) {
	if !e.Available() {
		return "", nil
	}
	return e.runner.Version(ctx)
}

// BinaryPath returns the resolved binary path (empty when unavailable).
func (e *Engine) BinaryPath() string {
	e.ensureRunner()
	if e.runner == nil {
		return ""
	}
	return e.runner.BinaryPath()
}

// Install downloads and verifies the pinned OpenTofu release, then points the
// engine's runner at it and returns the installed version.
func (e *Engine) Install(ctx context.Context) (string, error) {
	path, err := tofu.NewInstaller(e.settings.ToolsDir).Ensure(ctx)
	if err != nil {
		return "", err
	}
	e.runner = tofu.NewRunner(path)
	return e.runner.Version(ctx)
}

func (e *Engine) requireRunner() error {
	if !e.Available() {
		return fmt.Errorf("OpenTofu is not installed; install it before deploying")
	}
	return nil
}

// WorkspaceDir is the on-disk directory for a deployment.
func (e *Engine) WorkspaceDir(id string) string {
	return filepath.Join(e.settings.DeploymentsDir, id)
}

// RemoveWorkspace deletes a deployment's on-disk workspace (materialised recipe,
// tfvars, tfstate, plan). Used when a deployment record is removed so stale
// workspaces do not accumulate. A missing directory is not an error.
func (e *Engine) RemoveWorkspace(id string) error {
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("deployment id is required")
	}
	return os.RemoveAll(e.WorkspaceDir(id))
}

// Prepare materialises the recipe into the deployment workspace, writes the
// variables as tfvars, and, for a local AWS deployment, drops a LocalStack
// endpoint override so the unchanged recipe targets the emulator.
func (e *Engine) Prepare(deployment *Deployment) error {
	dir := e.WorkspaceDir(deployment.ID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	if err := e.loader.Materialise(deployment.RecipeID, dir); err != nil {
		return fmt.Errorf("materialise recipe: %w", err)
	}
	if err := writeTfvars(dir, deployment.Variables); err != nil {
		return fmt.Errorf("write tfvars: %w", err)
	}
	if deployment.ProviderID == "aws" || deployment.ProviderID == "azure" {
		target, err := e.registry.Resolve(deployment)
		if err != nil {
			return err
		}
		if err := target.WriteOverrides(dir, deployment, e.registry.opts); err != nil {
			return fmt.Errorf("write provider overrides: %w", err)
		}
	}
	if deployment.RecipeID == magentoComposeRecipeID {
		if err := renderMagentoComposeWorkspace(dir, deployment.Variables); err != nil {
			return fmt.Errorf("render magento compose workspace: %w", err)
		}
	}
	return nil
}

// Plan runs init + plan and returns the parsed diff.
func (e *Engine) Plan(ctx context.Context, deployment *Deployment, onLine tofu.LogFunc) (PlanSummary, error) {
	if err := e.requireRunner(); err != nil {
		return PlanSummary{}, err
	}
	if recipe, err := e.loader.Load(deployment.RecipeID); err == nil {
		if err := e.runBuildSteps(ctx, deployment, recipe.Manifest.Build, nil, onLine); err != nil {
			return PlanSummary{}, err
		}
		if err := e.runImagePipeline(ctx, deployment, recipe.Manifest.ImageBuild, onLine); err != nil {
			return PlanSummary{}, err
		}
	}
	dir := e.WorkspaceDir(deployment.ID)
	env := e.env(deployment)
	if _, err := e.runner.Run(ctx, tofu.RunOptions{Dir: dir, Env: env, OnLine: onLine, Args: []string{"init", "-input=false", "-no-color"}}); err != nil {
		return PlanSummary{}, err
	}
	if _, err := e.runner.Run(ctx, tofu.RunOptions{Dir: dir, Env: env, OnLine: onLine, Args: []string{"plan", "-input=false", "-no-color", "-out=" + planFile}}); err != nil {
		return PlanSummary{}, err
	}
	raw, err := e.runner.Run(ctx, tofu.RunOptions{Dir: dir, Env: env, Args: []string{"show", "-json", planFile}})
	if err != nil {
		return PlanSummary{}, err
	}
	return parsePlan(raw)
}

// Apply applies the previously saved plan and returns captured outputs. When
// post-apply steps fail the result still carries outputs and PostApplyError.
func (e *Engine) Apply(ctx context.Context, deployment *Deployment, onLine tofu.LogFunc) (ApplyResult, error) {
	if err := e.requireRunner(); err != nil {
		return ApplyResult{}, err
	}
	dir := e.WorkspaceDir(deployment.ID)
	env := e.env(deployment)
	if _, err := e.runner.Run(ctx, tofu.RunOptions{Dir: dir, Env: env, OnLine: onLine, Args: []string{"apply", "-input=false", "-no-color", planFile}}); err != nil {
		return ApplyResult{}, err
	}
	raw, err := e.runner.Run(ctx, tofu.RunOptions{Dir: dir, Env: env, Args: []string{"output", "-json"}})
	if err != nil {
		return ApplyResult{}, err
	}
	outputs, err := parseOutputs(raw)
	if err != nil {
		return ApplyResult{}, err
	}
	result := ApplyResult{Outputs: outputs}
	if recipe, loadErr := e.loader.Load(deployment.RecipeID); loadErr == nil && len(recipe.Manifest.PostApply) > 0 {
		if err := e.runBuildSteps(ctx, deployment, recipe.Manifest.PostApply, outputEnvVars(outputs), onLine); err != nil {
			result.PostApplyError = err.Error()
		}
	}
	return result, nil
}

// RetryPostApply re-runs post-apply steps for an already-applied deployment
// using the stored outputs as environment injection. Tofu is not invoked.
func (e *Engine) RetryPostApply(ctx context.Context, deployment *Deployment, onLine tofu.LogFunc) error {
	if len(deployment.Outputs) == 0 {
		return fmt.Errorf("deployment has no outputs; apply infrastructure first")
	}
	recipe, err := e.loader.Load(deployment.RecipeID)
	if err != nil {
		return err
	}
	if len(recipe.Manifest.PostApply) == 0 {
		return fmt.Errorf("recipe %q has no post-apply steps", deployment.RecipeID)
	}
	return e.runBuildSteps(ctx, deployment, recipe.Manifest.PostApply, outputEnvVars(deployment.Outputs), onLine)
}

// Destroy tears the deployment down.
func (e *Engine) Destroy(ctx context.Context, deployment *Deployment, onLine tofu.LogFunc) error {
	if err := e.requireRunner(); err != nil {
		return err
	}
	dir := e.WorkspaceDir(deployment.ID)
	env := e.env(deployment)
	_, err := e.runner.Run(ctx, tofu.RunOptions{Dir: dir, Env: env, OnLine: onLine, Args: []string{"destroy", "-input=false", "-auto-approve", "-no-color"}})
	return err
}

// runBuildSteps runs a recipe's build commands (e.g. `npm ci`) to package
// application code before planning. A step is skipped when its DirVar is empty
// or its Requires file is absent (so the bundled stub directory is left alone).
// outputEnvVars maps deployment outputs to process environment variables so
// post-apply steps can read live infrastructure values (database_url → DATABASE_URL).
func outputEnvVars(outputs []Output) []string {
	env := make([]string, 0, len(outputs))
	for _, output := range outputs {
		key := outputToEnvKey(output.Name)
		if key == "" {
			continue
		}
		env = append(env, key+"="+fmt.Sprint(output.Value))
	}
	return env
}

func outputToEnvKey(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return ""
	}
	return strings.ToUpper(strings.ReplaceAll(name, "-", "_"))
}

func (e *Engine) runBuildSteps(ctx context.Context, deployment *Deployment, steps []recipes.BuildStep, extraEnv []string, onLine tofu.LogFunc) error {
	for _, step := range steps {
		dir := ""
		if step.DirVar != "" {
			if value, ok := deployment.Variables[step.DirVar]; ok {
				dir = strings.TrimSpace(fmt.Sprint(value))
			}
		}
		if dir == "" {
			continue
		}
		if !filepath.IsAbs(dir) {
			dir = filepath.Join(e.WorkspaceDir(deployment.ID), dir)
		}
		if step.Requires != "" {
			if _, err := os.Stat(filepath.Join(dir, step.Requires)); err != nil {
				if onLine != nil {
					onLine(fmt.Sprintf("Skipping build step %q: %s not found in %s", step.Name, step.Requires, dir))
				}
				continue
			}
		}
		if len(step.Command) == 0 {
			continue
		}
		if onLine != nil {
			onLine(fmt.Sprintf("> %s: %s (in %s)", step.Name, strings.Join(step.Command, " "), dir))
		}
		cmd := exec.CommandContext(ctx, step.Command[0], step.Command[1:]...)
		cmd.Dir = dir
		if len(extraEnv) > 0 {
			cmd.Env = append(os.Environ(), extraEnv...)
		}
		sysproc.Hide(cmd)
		writer := &buildLineWriter{onLine: onLine}
		cmd.Stdout = writer
		cmd.Stderr = writer
		err := cmd.Run()
		writer.flush()
		if err != nil {
			if step.ContinueOnError {
				if onLine != nil {
					onLine(fmt.Sprintf("Build step %q failed (continuing): %v", step.Name, err))
				}
				continue
			}
			return fmt.Errorf("build step %q failed: %w", step.Name, err)
		}
	}
	return nil
}

// buildLineWriter emits complete lines to onLine as bytes arrive, buffering any
// trailing partial line until the next write or a final flush. It mirrors the
// streaming writer used by the tofu runner so build output (e.g. `npm ci`)
// surfaces live rather than only after the command exits.
type buildLineWriter struct {
	partial bytes.Buffer
	onLine  tofu.LogFunc
}

func (w *buildLineWriter) Write(p []byte) (int, error) {
	if w.onLine != nil {
		w.partial.Write(p)
		for {
			data := w.partial.Bytes()
			index := bytes.IndexByte(data, '\n')
			if index < 0 {
				break
			}
			line := strings.TrimRight(string(data[:index]), "\r")
			if strings.TrimSpace(line) != "" {
				w.onLine(line)
			}
			w.partial.Next(index + 1)
		}
	}
	return len(p), nil
}

func (w *buildLineWriter) flush() {
	if w.onLine != nil && w.partial.Len() > 0 {
		line := strings.TrimRight(w.partial.String(), "\r")
		if strings.TrimSpace(line) != "" {
			w.onLine(line)
		}
		w.partial.Reset()
	}
}

// env builds the provider environment via the resolved deployment target.
func (e *Engine) env(deployment *Deployment) []string {
	switch deployment.ProviderID {
	case "aws", "azure":
	default:
		return nil
	}
	target, err := e.registry.Resolve(deployment)
	if err != nil {
		return nil
	}
	return target.Env(deployment, e.settings)
}

// TargetLabel names a deployment's target for log lines.
func (e *Engine) TargetLabel(deployment *Deployment) string {
	switch deployment.ProviderID {
	case "aws", "azure":
	default:
		if deployment.Local {
			return "local emulator"
		}
		return strings.ToUpper(deployment.ProviderID)
	}
	target, err := e.registry.Resolve(deployment)
	if err != nil {
		return fallbackTargetLabel(deployment)
	}
	return target.Label(deployment)
}

func fallbackTargetLabel(deployment *Deployment) string {
	if deployment.Local {
		return "LocalStack"
	}
	if profile := strings.TrimSpace(deployment.ProfileID); profile != "" {
		return strings.ToUpper(deployment.ProviderID) + " profile " + profile
	}
	return strings.ToUpper(deployment.ProviderID)
}

func writeTfvars(dir string, variables map[string]any) error {
	if variables == nil {
		variables = map[string]any{}
	}
	data, err := json.MarshalIndent(variables, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, tfvarsFile), data, 0o644)
}

func parsePlan(raw []byte) (PlanSummary, error) {
	var decoded struct {
		ResourceChanges []struct {
			Address string `json:"address"`
			Type    string `json:"type"`
			Name    string `json:"name"`
			Change  struct {
				Actions []string `json:"actions"`
			} `json:"change"`
		} `json:"resource_changes"`
	}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return PlanSummary{}, fmt.Errorf("parse plan json: %w", err)
	}
	summary := PlanSummary{Changes: []ResourceChange{}}
	for _, change := range decoded.ResourceChanges {
		actions := change.Change.Actions
		if isNoOp(actions) {
			continue
		}
		switch {
		case contains(actions, "create") && contains(actions, "delete"):
			summary.Change++ // replacement
		case contains(actions, "create"):
			summary.Add++
		case contains(actions, "update"):
			summary.Change++
		case contains(actions, "delete"):
			summary.Destroy++
		}
		summary.Changes = append(summary.Changes, ResourceChange{
			Address: change.Address,
			Type:    change.Type,
			Name:    change.Name,
			Actions: actions,
		})
	}
	return summary, nil
}

func parseOutputs(raw []byte) ([]Output, error) {
	var decoded map[string]struct {
		Value     json.RawMessage `json:"value"`
		Sensitive bool            `json:"sensitive"`
	}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return nil, fmt.Errorf("parse outputs json: %w", err)
	}
	outputs := make([]Output, 0, len(decoded))
	for name, entry := range decoded {
		var value any
		_ = json.Unmarshal(entry.Value, &value)
		outputs = append(outputs, Output{Name: name, Value: value, Sensitive: entry.Sensitive})
	}
	sort.Slice(outputs, func(left, right int) bool {
		return outputs[left].Name < outputs[right].Name
	})
	return outputs, nil
}

func isNoOp(actions []string) bool {
	return len(actions) == 0 || (len(actions) == 1 && (actions[0] == "no-op" || actions[0] == "read"))
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

// NewID returns a time-ordered deployment id.
func NewID() string {
	return fmt.Sprintf("dep-%d", time.Now().UnixNano())
}
