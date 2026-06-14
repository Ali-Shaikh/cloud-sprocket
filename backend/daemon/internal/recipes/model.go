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

// LocalSpec records which local emulator (if any) a recipe can dry-run against.
type LocalSpec struct {
	Emulator string `yaml:"emulator" json:"emulator,omitempty"`
	// RequiresPro marks recipes whose services only emulate on LocalStack Pro
	// (e.g. ECS, RDS, CloudFront). Surfaced as a hint in the UI.
	RequiresPro bool `yaml:"requiresPro" json:"requiresPro,omitempty"`
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
}

// VariableHint layers UI metadata over a Terraform variable block.
type VariableHint struct {
	Name    string   `yaml:"name" json:"name"`
	Widget  string   `yaml:"widget" json:"widget,omitempty"`
	Options []string `yaml:"options" json:"options,omitempty"`
	Help    string   `yaml:"help" json:"help,omitempty"`
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

// Manifest is the recipe.yaml document.
type Manifest struct {
	APIVersion     string          `yaml:"apiVersion" json:"apiVersion"`
	ID             string          `yaml:"id" json:"id"`
	Version        string          `yaml:"version" json:"version"`
	Name           string          `yaml:"name" json:"name"`
	Summary        string          `yaml:"summary" json:"summary,omitempty"`
	Description    string          `yaml:"description" json:"description,omitempty"`
	Providers      []string        `yaml:"providers" json:"providers,omitempty"`
	Tags           []string        `yaml:"tags" json:"tags,omitempty"`
	Engine         EngineSpec      `yaml:"engine" json:"engine"`
	Local          LocalSpec       `yaml:"local" json:"local"`
	Build          []BuildStep     `yaml:"build" json:"build,omitempty"`
	VariableGroups []VariableGroup `yaml:"variableGroups" json:"variableGroups,omitempty"`
	Outputs        []OutputHint    `yaml:"outputs" json:"outputs,omitempty"`
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
	Options     []string `json:"options,omitempty"`
	Help        string   `json:"help,omitempty"`
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
