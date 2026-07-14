// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Package recipes models parameterised IaC "recipes" (curated OpenTofu modules
// plus a manifest of UI hints) and loads them from a filesystem source. Bundled
// recipes ship embedded; the same Loader will later back a remote recipe
// registry.
package recipes

import (
	"fmt"
	"strings"
)

// EngineSpec pins the IaC engine a recipe targets.
type EngineSpec struct {
	Type       string `yaml:"type" json:"type"`
	MinVersion string `yaml:"minVersion" json:"minVersion,omitempty"`
}

// LocalRuntimeSpec declares one compatible local dry-run runtime.
type LocalRuntimeSpec struct {
	ID          string `yaml:"id" json:"id"`
	RequiresPro bool   `yaml:"requiresPro" json:"requiresPro,omitempty"`
}

// LocalSpec records which local emulator (if any) a recipe can dry-run against.
type LocalSpec struct {
	Emulator string `yaml:"emulator" json:"emulator,omitempty"`
	// RequiresPro marks recipes whose services only emulate on LocalStack Pro
	// (e.g. ECS, RDS, CloudFront). Surfaced as a hint in the UI.
	RequiresPro bool `yaml:"requiresPro" json:"requiresPro,omitempty"`
	// Runtimes is the preferred shape; legacy emulator/requiresPro are normalised
	// into this list on load.
	Runtimes []LocalRuntimeSpec `yaml:"runtimes" json:"runtimes,omitempty"`
}

// SuperpowersSpec declares how an app-deploy recipe plugs into the local-first
// workbench (IAM Policy Stream, chaos scenarios). Cloud Pods are intentionally
// not surfaced in the app (LocalStack paid feature).
type SuperpowersSpec struct {
	IamPolicyStream bool     `yaml:"iamPolicyStream" json:"iamPolicyStream,omitempty"`
	Chaos           []string `yaml:"chaos" json:"chaos,omitempty"`
}

// ImageBuildSpec wires a Dockerfile directory into a container image variable
// before plan/apply. Distribution differs by target (local Docker vs ECR push).
type ImageBuildSpec struct {
	// DockerfileDirVar is the deployment variable holding the build context.
	DockerfileDirVar string `yaml:"dockerfileDirVar" json:"dockerfileDirVar"`
	// ImageVar is the Terraform variable receiving the built image URI or tag.
	ImageVar string `yaml:"imageVar" json:"imageVar"`
	// RepositoryVar, when set, names a variable used as the ECR repository
	// segment on real AWS (defaults to app_name-environment-api).
	RepositoryVar string `yaml:"repositoryVar" json:"repositoryVar,omitempty"`
}

// BuildStep is a command run in the deployment workspace before plan/apply, used
// to package application code (e.g. `npm ci` in a backend source dir). The step
// is skipped when DirVar resolves to an empty path or Requires is absent.
type BuildStep struct {
	Name string `yaml:"name" json:"name"`
	// DirVar is the deployment variable holding the working directory. Relative
	// paths resolve against the workspace; absolute paths are used as-is.
	DirVar string `yaml:"dirVar" json:"dirVar"`
	// Requires, when set, skips the step unless this file exists in the dir
	// (e.g. "package.json" so the bundled stub directory is skipped).
	Requires string   `yaml:"requires" json:"requires,omitempty"`
	Command  []string `yaml:"command" json:"command"`
	// ContinueOnError runs the step but does not abort the deploy when it fails
	// (e.g. a migration against a not-yet-ready database).
	ContinueOnError bool `yaml:"continueOnError" json:"continueOnError,omitempty"`
}

// VisibleWhen gates a form field until another variable equals a value.
type VisibleWhen struct {
	Variable string `yaml:"variable" json:"variable"`
	Equals   string `yaml:"equals" json:"equals"`
}

// VariableHint layers UI metadata over a Terraform variable block.
type VariableHint struct {
	Name        string       `yaml:"name" json:"name"`
	Widget      string       `yaml:"widget" json:"widget,omitempty"`
	Options     []string     `yaml:"options" json:"options,omitempty"`
	Help        string       `yaml:"help" json:"help,omitempty"`
	VisibleWhen *VisibleWhen `yaml:"visibleWhen" json:"visibleWhen,omitempty"`
}

// VariableGroup groups and orders variables for the generated form.
type VariableGroup struct {
	Title     string         `yaml:"title" json:"title"`
	Variables []VariableHint `yaml:"variables" json:"variables"`
}

// OutputHint marks which outputs to surface (and which are primary).
type OutputHint struct {
	Name    string `yaml:"name" json:"name"`
	Primary bool   `yaml:"primary" json:"primary,omitempty"`
}

// LabSpec describes a guided, verifiable learning experience for a recipe.
type LabSpec struct {
	Difficulty       string    `yaml:"difficulty" json:"difficulty,omitempty"`
	EstimatedMinutes int       `yaml:"estimatedMinutes" json:"estimatedMinutes,omitempty"`
	Objectives       []string  `yaml:"objectives" json:"objectives,omitempty"`
	Steps            []LabStep `yaml:"steps" json:"steps,omitempty"`
}

// LabStep is one instruction block in a lab with optional actions and checks.
type LabStep struct {
	ID      string      `yaml:"id" json:"id"`
	Title   string      `yaml:"title" json:"title"`
	Body    string      `yaml:"body" json:"body,omitempty"`
	// Fault optionally injects a runtime chaos fault for the duration of this
	// step (A6). Unsupported runtimes surface a clear error on verify.
	Fault   *LabFault   `yaml:"fault" json:"fault,omitempty"`
	Actions []LabAction `yaml:"actions" json:"actions,omitempty"`
	Verify  []LabVerify `yaml:"verify" json:"verify,omitempty"`
	Hints   []string    `yaml:"hints" json:"hints,omitempty"`
}

// LabFault is an abstract chaos request declared on a lab step.
type LabFault struct {
	// Kind is a FaultKind value (service-error, latency, partition, pause).
	Kind   string            `yaml:"kind" json:"kind"`
	// Target names the dependency (container, service, etc.).
	Target string            `yaml:"target" json:"target,omitempty"`
	Params map[string]string `yaml:"params" json:"params,omitempty"`
}

// LabAction deep-links to a workspace tab or invokes a gated write operation.
type LabAction struct {
	Type   string            `yaml:"type" json:"type"`
	Tab    string            `yaml:"tab" json:"tab,omitempty"`
	Focus  string            `yaml:"focus" json:"focus,omitempty"`
	Op     string            `yaml:"op" json:"op,omitempty"`
	Params map[string]string `yaml:"params" json:"params,omitempty"`
}

// LabVerify declares an on-demand verification check for a lab step.
// Fields are type-specific; unused fields are ignored at runtime.
type LabVerify struct {
	Type      string `yaml:"type" json:"type"`
	Queue     string `yaml:"queue" json:"queue,omitempty"`
	Attribute string `yaml:"attribute" json:"attribute,omitempty"`
	Compare   string `yaml:"compare" json:"compare,omitempty"`
	Value     string `yaml:"value" json:"value,omitempty"`
	URL       string `yaml:"url" json:"url,omitempty"`
	// s3.object
	Bucket   string `yaml:"bucket" json:"bucket,omitempty"`
	Key      string `yaml:"key" json:"key,omitempty"`
	Contains string `yaml:"contains" json:"contains,omitempty"`
	// dynamodb.item
	Table   string `yaml:"table" json:"table,omitempty"`
	KeyJSON string `yaml:"keyJson" json:"keyJson,omitempty"`
	// lambda.invoke
	Function string `yaml:"function" json:"function,omitempty"`
	Payload  string `yaml:"payload" json:"payload,omitempty"`
	// logs.contains
	LogGroup string `yaml:"logGroup" json:"logGroup,omitempty"`
	Pattern  string `yaml:"pattern" json:"pattern,omitempty"`
	// secrets.value
	Secret string `yaml:"secret" json:"secret,omitempty"`
	// sns.subscription
	Topic string `yaml:"topic" json:"topic,omitempty"`
	// azure.blob / azure.queue-depth
	Account   string `yaml:"account" json:"account,omitempty"`
	Container string `yaml:"container" json:"container,omitempty"`
	Blob      string `yaml:"blob" json:"blob,omitempty"`
}

// Manifest is the recipe.yaml document.
type Manifest struct {
	APIVersion     string          `yaml:"apiVersion" json:"apiVersion"`
	ID             string          `yaml:"id" json:"id"`
	Version        string          `yaml:"version" json:"version"`
	Name           string          `yaml:"name" json:"name"`
	Summary        string          `yaml:"summary" json:"summary,omitempty"`
	Description    string          `yaml:"description" json:"description,omitempty"`
	// Kind classifies gallery intent: app-deploy or service-lab.
	Kind           string          `yaml:"kind" json:"kind,omitempty"`
	Providers      []string        `yaml:"providers" json:"providers,omitempty"`
	Tags           []string        `yaml:"tags" json:"tags,omitempty"`
	Engine         EngineSpec      `yaml:"engine" json:"engine"`
	Local          LocalSpec       `yaml:"local" json:"local"`
	Superpowers    SuperpowersSpec `yaml:"superpowers" json:"superpowers,omitempty"`
	ImageBuild     *ImageBuildSpec `yaml:"imageBuild" json:"imageBuild,omitempty"`
	Build          []BuildStep     `yaml:"build" json:"build,omitempty"`
	// PostApply runs after a successful apply, with deployment outputs injected as
	// environment variables (e.g. database_url → DATABASE_URL) so migrations can
	// reach the live database.
	PostApply      []BuildStep     `yaml:"postApply" json:"postApply,omitempty"`
	VariableGroups []VariableGroup `yaml:"variableGroups" json:"variableGroups,omitempty"`
	Outputs        []OutputHint    `yaml:"outputs" json:"outputs,omitempty"`
	Lab            *LabSpec        `yaml:"lab" json:"lab,omitempty"`
	// Source is set by the loader (not in recipe.yaml): bundled | imported.
	Source         string          `yaml:"-" json:"source,omitempty"`
}

// Validate checks the registry-required fields.
func (m Manifest) Validate() error {
	if strings.TrimSpace(m.ID) == "" {
		return fmt.Errorf("recipe manifest is missing id")
	}
	if strings.TrimSpace(m.Name) == "" {
		return fmt.Errorf("recipe %q is missing name", m.ID)
	}
	if strings.TrimSpace(m.Version) == "" {
		return fmt.Errorf("recipe %q is missing version", m.ID)
	}
	return nil
}

// Variable is a recipe input merged from the Terraform variable block and the
// manifest UI hints.
type Variable struct {
	Name        string   `json:"name"`
	Type        string   `json:"type"`
	Description string   `json:"description,omitempty"`
	Default     any      `json:"default,omitempty"`
	Required    bool     `json:"required"`
	Sensitive   bool     `json:"sensitive,omitempty"`
	Group       string   `json:"group"`
	Widget      string   `json:"widget"`
	Options     []string     `json:"options,omitempty"`
	Help        string       `json:"help,omitempty"`
	VisibleWhen *VisibleWhen `json:"visibleWhen,omitempty"`
}

// Output is a recipe output merged with its manifest hint.
type Output struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Sensitive   bool   `json:"sensitive,omitempty"`
	Primary     bool   `json:"primary,omitempty"`
}

// Recipe is a fully resolved recipe: manifest plus introspected variables and
// outputs, ready for the GUI form.
type Recipe struct {
	Manifest  Manifest   `json:"manifest"`
	Variables []Variable `json:"variables"`
	Outputs   []Output   `json:"outputs"`
}

const defaultGroup = "General"

// inferWidget picks a sensible form widget when the manifest gives none.
func inferWidget(v Variable) string {
	if v.Sensitive {
		return "password"
	}
	if len(v.Options) > 0 {
		return "select"
	}
	switch {
	case v.Type == "bool":
		return "switch"
	case v.Type == "number":
		return "number"
	case strings.HasPrefix(v.Type, "map"),
		strings.HasPrefix(v.Type, "list"),
		strings.HasPrefix(v.Type, "set"),
		strings.HasPrefix(v.Type, "object"),
		strings.HasPrefix(v.Type, "tuple"):
		return "textarea"
	default:
		return "text"
	}
}
