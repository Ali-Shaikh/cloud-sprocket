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
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/policy"
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
	ID         string `json:"id"`
	RecipeID   string `json:"recipeId"`
	Name       string `json:"name"`
	ProviderID string `json:"providerId"`
	ProfileID  string `json:"profileId"`
	Local      bool   `json:"local"`
	// RuntimeID names the local emulator when Local is true (e.g. "localstack").
	// Empty means the default for the provider (localstack for local AWS).
	RuntimeID string             `json:"runtimeId,omitempty"`
	Variables map[string]any     `json:"variables"`
	Status    Status             `json:"status"`
	Plan      *PlanSummary       `json:"plan,omitempty"`
	Policy    *policy.Evaluation `json:"policy,omitempty"`
	Outputs   []Output           `json:"outputs,omitempty"`
	// SensitiveVars names the variables whose values are secret (from the
	// recipe), so they can be sealed at rest in the persisted record.
	SensitiveVars []string `json:"sensitiveVars,omitempty"`
	Error         string   `json:"error,omitempty"`
	// PostApplyError is set when infrastructure applied successfully but a
	// post-apply build step failed (e.g. database migrations). The deployment
	// stays in StatusApplied so outputs remain usable and steps can be retried.
	PostApplyError string `json:"postApplyError,omitempty"`
	// Drift holds the last drift check result (populated by CheckDrift for applied deployments).
	Drift *DriftReport `json:"drift,omitempty"`
	// RecipeVersion records the manifest version at creation or last update (for B3 upgrade detection).
	RecipeVersion string `json:"recipeVersion,omitempty"`
	// Revisions holds prior snapshots for history (backend support for revisioned deployments).
	Revisions []DeploymentRevision `json:"revisions,omitempty"`
	CreatedAt string               `json:"createdAt"`
	UpdatedAt string               `json:"updatedAt"`
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

// DriftReport is the result of a drift check (manual "Check drift" on an applied deployment).
type DriftReport struct {
	HasDrift bool         `json:"hasDrift"`
	Drift    *PlanSummary `json:"drift,omitempty"` // reuses PlanSummary shape for drifted resources
}

// DeploymentRevision captures a prior configuration of an applied deployment
// to support update history and potential rollback by re-apply of old values.
type DeploymentRevision struct {
	At            string             `json:"at"`
	RecipeVersion string             `json:"recipeVersion,omitempty"`
	Variables     map[string]any     `json:"variables"`
	Plan          *PlanSummary       `json:"plan,omitempty"`
	Policy        *policy.Evaluation `json:"policy,omitempty"`
}

const (
	tfvarsFile    = "cloudsprocket.auto.tfvars.json"
	overrideFile  = "cloudsprocket_localstack_override.tf"
	planFile      = "cloudsprocket.tfplan"
	driftPlanFile = "cloudsprocket.drift.tfplan"
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
//
// On Windows, a cancelled or hung apply often leaves terraform-provider-*.exe
// running under the workspace, which locks provider binaries and makes the first
// RemoveAll fail with "Access is denied". We stop those processes and retry.
func (e *Engine) RemoveWorkspace(id string) error {
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("deployment id is required")
	}
	dir := e.WorkspaceDir(id)
	if _, err := os.Stat(dir); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if err := os.RemoveAll(dir); err == nil {
		return nil
	}
	// Best-effort unlock: kill leftover tofu/provider processes started from this dir.
	sysproc.StopProcessesUnder(dir)
	var last error
	for attempt := 0; attempt < 6; attempt++ {
		time.Sleep(time.Duration(100*(attempt+1)) * time.Millisecond)
		last = os.RemoveAll(dir)
		if last == nil {
			return nil
		}
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			return nil
		}
		sysproc.StopProcessesUnder(dir)
	}
	return fmt.Errorf("could not remove deployment workspace (a provider process may still be locking files): %w", last)
}

// ReleaseWorkspace stops leftover tofu/provider processes under a deployment
// workspace so cancel/stop does not leave locked binaries behind.
func (e *Engine) ReleaseWorkspace(id string) {
	if strings.TrimSpace(id) == "" {
		return
	}
	sysproc.StopProcessesUnder(e.WorkspaceDir(id))
}

// Prepare materialises the recipe into the deployment workspace, writes the
// variables as tfvars, and, for a local AWS deployment, drops a LocalStack
// endpoint override so the unchanged recipe targets the emulator.
func (e *Engine) Prepare(deployment *Deployment) error {
	NormaliseDeploymentTarget(deployment)
	dir := e.WorkspaceDir(deployment.ID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	if err := e.loader.Materialise(deployment.RecipeID, dir); err != nil {
		return fmt.Errorf("materialise recipe: %w", err)
	}
	return e.writeWorkspaceFiles(dir, deployment)
}

// SyncWorkspace ensures the deployment workspace exists and that tfvars plus
// provider overrides match the current target wiring. Plan, apply, and destroy
// call this so a rebuilt daemon or retried apply cannot reuse stale floci-az
// provider configuration from an earlier prepare.
func (e *Engine) SyncWorkspace(deployment *Deployment) error {
	NormaliseDeploymentTarget(deployment)
	dir := e.WorkspaceDir(deployment.ID)
	if _, err := os.Stat(filepath.Join(dir, "main.tf")); err != nil {
		return e.Prepare(deployment)
	}
	return e.writeWorkspaceFiles(dir, deployment)
}

func (e *Engine) writeWorkspaceFiles(dir string, deployment *Deployment) error {
	if err := writeTfvars(dir, deployment.Variables); err != nil {
		return fmt.Errorf("write tfvars: %w", err)
	}
	target, err := e.registry.ResolveTarget(deployment)
	if err != nil {
		return err
	}
	if target != nil {
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
	if err := e.guardFlociAzureWebHosting(deployment); err != nil {
		return PlanSummary{}, err
	}
	if err := e.SyncWorkspace(deployment); err != nil {
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
	if onLine != nil {
		onLine("Initialising OpenTofu and installing providers when needed. First-time Azure (azurerm) downloads can take several minutes and require access to registry.opentofu.org and GitHub.")
	}
	initCtx, initCancel := context.WithTimeout(ctx, tofuInitTimeout)
	defer initCancel()
	if _, err := e.runner.Run(initCtx, tofu.RunOptions{Dir: dir, Env: env, OnLine: onLine, Args: []string{"init", "-input=false", "-no-color"}}); err != nil {
		return PlanSummary{}, err
	}
	if onLine != nil {
		onLine("Providers ready. Computing plan...")
	}
	if _, err := e.runner.Run(ctx, tofu.RunOptions{Dir: dir, Env: env, OnLine: onLine, Args: []string{"plan", "-input=false", "-no-color", "-out=" + planFile}}); err != nil {
		return PlanSummary{}, err
	}
	raw, err := e.runner.Run(ctx, tofu.RunOptions{Dir: dir, Env: env, Args: []string{"show", "-json", planFile}})
	if err != nil {
		return PlanSummary{}, err
	}
	summary, err := parsePlan(raw)
	if err != nil {
		return PlanSummary{}, err
	}
	digest, err := fileDigest(filepath.Join(dir, planFile))
	if err != nil {
		return PlanSummary{}, fmt.Errorf("hash saved plan: %w", err)
	}
	evaluation, err := policy.Evaluate(ctx, raw, policy.Options{
		Local:          deployment.Local,
		PlanDigest:     digest,
		RequiredTags:   e.settings.PolicyRequiredTags,
		AllowedRegions: e.settings.PolicyAllowedRegions,
	})
	if err != nil {
		return PlanSummary{}, err
	}
	deployment.Policy = &evaluation
	if onLine != nil {
		onLine(policyPlanLog(evaluation))
	}
	return summary, nil
}

// Apply applies the previously saved plan and returns captured outputs. When
// post-apply steps fail the result still carries outputs and PostApplyError.
func (e *Engine) Apply(ctx context.Context, deployment *Deployment, onLine tofu.LogFunc) (ApplyResult, error) {
	if err := e.requireRunner(); err != nil {
		return ApplyResult{}, err
	}
	if err := e.SyncWorkspace(deployment); err != nil {
		return ApplyResult{}, err
	}
	if err := e.validateApplyPolicy(ctx, deployment, onLine); err != nil {
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
	if err := e.SyncWorkspace(deployment); err != nil {
		return err
	}
	dir := e.WorkspaceDir(deployment.ID)
	env := e.env(deployment)
	_, err := e.runner.Run(ctx, tofu.RunOptions{Dir: dir, Env: env, OnLine: onLine, Args: []string{"destroy", "-input=false", "-auto-approve", "-no-color"}})
	return err
}

// CheckDrift performs a refresh-only plan with -detailed-exitcode to detect
// configuration drift on an already-applied deployment. It is intentionally
// manual (button-driven) for v0.9.1; a scheduled local-only sweep can be added later.
func (e *Engine) CheckDrift(ctx context.Context, deployment *Deployment, onLine tofu.LogFunc) (DriftReport, error) {
	if err := e.requireRunner(); err != nil {
		return DriftReport{}, err
	}
	if err := e.SyncWorkspace(deployment); err != nil {
		return DriftReport{}, err
	}
	// Skip heavy build/image steps for a pure drift check.
	dir := e.WorkspaceDir(deployment.ID)
	env := e.env(deployment)

	// Use -detailed-exitcode so exit 2 means "drift detected".
	_, exitCode, runErr := e.runner.RunWithExitCode(ctx, tofu.RunOptions{
		Dir:    dir,
		Env:    env,
		OnLine: onLine,
		Args:   []string{"plan", "-input=false", "-no-color", "-refresh-only", "-detailed-exitcode", "-out=" + driftPlanFile},
	})
	if runErr != nil {
		// Non-zero but not the drift sentinel is a real error.
		if exitCode != 2 {
			return DriftReport{}, runErr
		}
	}

	raw, err := e.runner.Run(ctx, tofu.RunOptions{Dir: dir, Env: env, Args: []string{"show", "-json", driftPlanFile}})
	if err != nil {
		return DriftReport{}, err
	}

	report, err := parseDrift(raw)
	if err != nil {
		return DriftReport{}, err
	}
	report.HasDrift = report.HasDrift || exitCode == 2
	return report, nil
}

func (e *Engine) validateApplyPolicy(ctx context.Context, deployment *Deployment, onLine tofu.LogFunc) error {
	if deployment.Policy == nil {
		return fmt.Errorf("deployment has no policy evaluation; plan again before applying")
	}
	dir := e.WorkspaceDir(deployment.ID)
	digest, err := fileDigest(filepath.Join(dir, planFile))
	if err != nil {
		return fmt.Errorf("hash saved plan before apply: %w", err)
	}
	if digest != deployment.Policy.PlanDigest {
		return fmt.Errorf("saved plan changed after policy evaluation; plan again before applying")
	}
	raw, err := e.runner.Run(ctx, tofu.RunOptions{Dir: dir, Env: e.env(deployment), Args: []string{"show", "-json", planFile}})
	if err != nil {
		return fmt.Errorf("read saved plan before policy recheck: %w", err)
	}
	current, err := policy.Evaluate(ctx, raw, policy.Options{
		Local:          deployment.Local,
		PlanDigest:     digest,
		RequiredTags:   e.settings.PolicyRequiredTags,
		AllowedRegions: e.settings.PolicyAllowedRegions,
	})
	if err != nil {
		return err
	}
	if current.DecisionDigest != deployment.Policy.DecisionDigest {
		return fmt.Errorf("policy decision changed after planning; plan again before applying")
	}
	if current.Status == policy.StatusBlocked && !deployment.Policy.HasValidOverride() {
		return fmt.Errorf("policy guardrails blocked apply; use the required typed override or plan a compliant change")
	}
	if onLine != nil {
		if current.Status == policy.StatusBlocked {
			onLine("Policy guardrails revalidated; recorded override matches this exact plan.")
		} else {
			onLine("Policy guardrails revalidated for the saved plan.")
		}
	}
	return nil
}

func policyPlanLog(evaluation policy.Evaluation) string {
	switch evaluation.Status {
	case policy.StatusBlocked:
		return fmt.Sprintf("Policy guardrails: %d finding(s), %d blocking live apply.", len(evaluation.Findings), evaluation.BlockingCount)
	case policy.StatusWarned:
		return fmt.Sprintf("Policy guardrails: %d warning finding(s).", len(evaluation.Findings))
	default:
		return "Policy guardrails: passed."
	}
}

func fileDigest(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return "sha256:" + hex.EncodeToString(hash.Sum(nil)), nil
}

// parseDrift extracts drift information from `tofu show -json` output.
// Prefers the dedicated `resource_drift` array (OpenTofu 1.x); falls back to
// resource_changes that represent out-of-band modifications.
func parseDrift(raw []byte) (DriftReport, error) {
	var plan struct {
		ResourceDrift   []ResourceChange `json:"resource_drift"`
		ResourceChanges []ResourceChange `json:"resource_changes"`
	}
	if err := json.Unmarshal(raw, &plan); err != nil {
		return DriftReport{}, fmt.Errorf("parse plan JSON: %w", err)
	}

	drifted := plan.ResourceDrift
	if len(drifted) == 0 {
		for _, ch := range plan.ResourceChanges {
			// Heuristic: changes that are not pure no-op or create/destroy in the plan
			// but represent real drift are already filtered by tofu in refresh-only.
			if len(ch.Actions) > 0 && !isNoOp(ch.Actions) {
				drifted = append(drifted, ch)
			}
		}
	}

	return DriftReport{
		HasDrift: len(drifted) > 0,
		Drift: &PlanSummary{
			Changes: drifted,
			// counts left as 0 for drift view; UI can use len(Changes)
		},
	}, nil
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

// env builds the provider environment via the resolved deployment target and
// always injects a shared OpenTofu plugin cache so large providers (azurerm is
// ~63 MB) are downloaded once and reused across deployments.
func (e *Engine) env(deployment *Deployment) []string {
	env := tofuPluginCacheEnv(e.settings)
	target, err := e.registry.ResolveTarget(deployment)
	if err != nil || target == nil {
		return env
	}
	return append(env, target.Env(deployment, e.settings)...)
}

// tofuPluginCacheEnv returns TF_PLUGIN_CACHE_DIR under the app config root.
// The directory is created if missing so tofu can write into it immediately.
// When ConfigDir is empty or not absolute, nothing is injected so tofu does not
// resolve a relative plugin-cache path against the process working directory.
func tofuPluginCacheEnv(settings config.Settings) []string {
	configDir := strings.TrimSpace(settings.ConfigDir)
	if configDir == "" || !filepath.IsAbs(configDir) {
		return nil
	}
	cacheDir := filepath.Join(configDir, "plugin-cache")
	_ = os.MkdirAll(cacheDir, 0o755)
	return []string{"TF_PLUGIN_CACHE_DIR=" + cacheDir}
}

// guardFlociAzureWebHosting blocks plans that would hang on floci-az for App
// Service / Function App resources (service plan create never completes).
func (e *Engine) guardFlociAzureWebHosting(deployment *Deployment) error {
	if deployment == nil || !deployment.Local || deployment.ProviderID != "azure" {
		return nil
	}
	NormaliseDeploymentTarget(deployment)
	if strings.TrimSpace(deployment.RuntimeID) != recipes.RuntimeFlociAz {
		return nil
	}
	needs, err := e.loader.NeedsAzureWebHosting(deployment.RecipeID)
	if err != nil {
		return err
	}
	if needs {
		return fmt.Errorf("%s", recipes.FlociAzUnsupportedWebHostingMessage)
	}
	return nil
}

// TargetLabel names a deployment's target for log lines.
func (e *Engine) TargetLabel(deployment *Deployment) string {
	target, err := e.registry.ResolveTarget(deployment)
	if err != nil || target == nil {
		return fallbackTargetLabel(deployment)
	}
	return target.Label(deployment)
}

// fallbackTargetLabel names a deployment when no concrete target resolves (a
// target-less provider or an unknown runtime). It avoids guessing a specific
// emulator so the log line cannot mislabel, say, a non-AWS local run "LocalStack".
func fallbackTargetLabel(deployment *Deployment) string {
	if deployment.Local {
		return "local emulator"
	}
	if profile := strings.TrimSpace(deployment.ProfileID); profile != "" {
		return strings.ToUpper(deployment.ProviderID) + " profile " + profile
	}
	if strings.TrimSpace(deployment.ProviderID) == "" {
		return "deployment target"
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
