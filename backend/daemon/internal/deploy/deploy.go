// Package deploy orchestrates recipe deployments through the OpenTofu engine:
// it prepares a per-deployment workspace (materialised recipe + tfvars + an
// optional LocalStack endpoint override), then runs init/plan/apply/destroy and
// parses the results into structured diffs and outputs.
package deploy

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/recipes"
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
)

// Deployment is one instantiation of a recipe against a connection profile.
type Deployment struct {
	ID         string         `json:"id"`
	RecipeID   string         `json:"recipeId"`
	Name       string         `json:"name"`
	ProviderID string         `json:"providerId"`
	ProfileID  string         `json:"profileId"`
	Local      bool           `json:"local"`
	Variables  map[string]any `json:"variables"`
	Status     Status         `json:"status"`
	Outputs    []Output       `json:"outputs,omitempty"`
	CreatedAt  string         `json:"createdAt"`
	UpdatedAt  string         `json:"updatedAt"`
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
	overrideFile  = "cloudsprocket_localstack_override.tf"
	planFile      = "cloudsprocket.tfplan"
	localStackURL = "http://localhost:4566"
)

// Engine runs deployments via a tofu runner.
type Engine struct {
	runner   *tofu.Runner
	settings config.Settings
	loader   *recipes.Loader
	// localStackEndpoint is overridable for tests.
	localStackEndpoint string
}

// NewEngine builds an engine bound to a runner, settings and recipe loader.
func NewEngine(runner *tofu.Runner, settings config.Settings, loader *recipes.Loader) *Engine {
	return &Engine{
		runner:             runner,
		settings:           settings,
		loader:             loader,
		localStackEndpoint: localStackURL,
	}
}

// WorkspaceDir is the on-disk directory for a deployment.
func (e *Engine) WorkspaceDir(id string) string {
	return filepath.Join(e.settings.DeploymentsDir, id)
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
	if deployment.Local && deployment.ProviderID == "aws" {
		if err := os.WriteFile(filepath.Join(dir, overrideFile), []byte(localStackOverride(e.localStackEndpoint)), 0o644); err != nil {
			return fmt.Errorf("write localstack override: %w", err)
		}
	}
	return nil
}

// Plan runs init + plan and returns the parsed diff.
func (e *Engine) Plan(ctx context.Context, deployment *Deployment, onLine tofu.LogFunc) (PlanSummary, error) {
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

// Apply applies the previously saved plan and returns the captured outputs.
func (e *Engine) Apply(ctx context.Context, deployment *Deployment, onLine tofu.LogFunc) ([]Output, error) {
	dir := e.WorkspaceDir(deployment.ID)
	env := e.env(deployment)
	if _, err := e.runner.Run(ctx, tofu.RunOptions{Dir: dir, Env: env, OnLine: onLine, Args: []string{"apply", "-input=false", "-no-color", planFile}}); err != nil {
		return nil, err
	}
	raw, err := e.runner.Run(ctx, tofu.RunOptions{Dir: dir, Env: env, Args: []string{"output", "-json"}})
	if err != nil {
		return nil, err
	}
	return parseOutputs(raw)
}

// Destroy tears the deployment down.
func (e *Engine) Destroy(ctx context.Context, deployment *Deployment, onLine tofu.LogFunc) error {
	dir := e.WorkspaceDir(deployment.ID)
	env := e.env(deployment)
	_, err := e.runner.Run(ctx, tofu.RunOptions{Dir: dir, Env: env, OnLine: onLine, Args: []string{"destroy", "-input=false", "-auto-approve", "-no-color"}})
	return err
}

// env builds the provider environment: dummy credentials for a local emulator,
// otherwise the user's real profile and config files.
func (e *Engine) env(deployment *Deployment) []string {
	if deployment.Local && deployment.ProviderID == "aws" {
		return []string{
			"AWS_ACCESS_KEY_ID=test",
			"AWS_SECRET_ACCESS_KEY=test",
			"AWS_DEFAULT_REGION=us-east-1",
		}
	}
	if deployment.ProviderID == "aws" {
		return []string{
			"AWS_PROFILE=" + deployment.ProfileID,
			"AWS_CONFIG_FILE=" + e.settings.AWSConfigPath,
			"AWS_SHARED_CREDENTIALS_FILE=" + e.settings.AWSCredentialsPath,
		}
	}
	return nil
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
