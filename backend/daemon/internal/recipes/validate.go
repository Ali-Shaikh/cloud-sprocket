// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package recipes

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/hashicorp/terraform-config-inspect/tfconfig"
	"gopkg.in/yaml.v3"
)

// Finding is one validation issue (error or warning).
type Finding struct {
	Severity string `json:"severity"` // "error" | "warning"
	Code     string `json:"code"`
	Message  string `json:"message"`
}

// ValidationReport is the result of validating a recipe folder (C1).
type ValidationReport struct {
	OK       bool      `json:"ok"`
	ID       string    `json:"id,omitempty"`
	Version  string    `json:"version,omitempty"`
	Name     string    `json:"name,omitempty"`
	Kind     string    `json:"kind,omitempty"`
	Providers []string `json:"providers,omitempty"`
	// BuildCommands are declared pre-apply shell steps (trust risk surface).
	BuildCommands []string `json:"buildCommands,omitempty"`
	// LabStepCount is non-zero when a guided lab section is present.
	LabStepCount int       `json:"labStepCount,omitempty"`
	Findings     []Finding `json:"findings"`
	// SourcePath is the folder that was validated.
	SourcePath string `json:"sourcePath,omitempty"`
}

// ValidateDirectory validates a local recipe folder for authoring and import (C1).
// It checks manifest schema-ish requirements, lab semantics, module presence, and
// coherence of build/imageBuild variable references against the OpenTofu module.
func ValidateDirectory(dir string) (ValidationReport, error) {
	raw := strings.TrimSpace(dir)
	if raw == "" {
		return ValidationReport{}, fmt.Errorf("sourcePath is required")
	}
	dir = filepath.Clean(raw)
	// Clean of empty becomes ".", which would validate the process CWD — reject it.
	if dir == "." && raw != "." {
		return ValidationReport{}, fmt.Errorf("sourcePath is required")
	}
	info, err := os.Stat(dir)
	if err != nil {
		return ValidationReport{}, fmt.Errorf("open recipe dir: %w", err)
	}
	if !info.IsDir() {
		return ValidationReport{}, fmt.Errorf("sourcePath must be a directory: %s", dir)
	}

	report := ValidationReport{SourcePath: dir, Findings: []Finding{}}
	manifestPath := filepath.Join(dir, manifestFile)
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		report.addError("manifest.missing", fmt.Sprintf("read recipe.yaml: %v", err))
		report.OK = false
		return report, nil
	}
	var m Manifest
	if err := yaml.Unmarshal(data, &m); err != nil {
		report.addError("manifest.parse", fmt.Sprintf("parse recipe.yaml: %v", err))
		report.OK = false
		return report, nil
	}
	if strings.TrimSpace(m.ID) == "" {
		m.ID = filepath.Base(dir)
	}
	report.ID = m.ID
	report.Version = m.Version
	report.Name = m.Name
	report.Kind = m.Kind
	report.Providers = append([]string(nil), m.Providers...)

	if err := m.Validate(); err != nil {
		report.addError("manifest.required", err.Error())
	}
	if strings.TrimSpace(m.APIVersion) == "" {
		report.addWarning("manifest.apiVersion", "apiVersion is empty; expected cloudsprocket.recipe/v1")
	} else if !strings.HasPrefix(m.APIVersion, "cloudsprocket.recipe/") {
		report.addWarning("manifest.apiVersion", fmt.Sprintf("unexpected apiVersion %q", m.APIVersion))
	}
	if strings.TrimSpace(m.Engine.Type) == "" {
		report.addError("engine.type", "engine.type is required (e.g. opentofu)")
	} else if m.Engine.Type != "opentofu" && m.Engine.Type != "terraform" {
		report.addWarning("engine.type", fmt.Sprintf("unusual engine.type %q", m.Engine.Type))
	}
	if len(m.Providers) == 0 {
		report.addWarning("providers", "no providers declared; gallery filtering may hide this recipe")
	}
	kind := strings.TrimSpace(m.Kind)
	if kind != "" && kind != KindAppDeploy && kind != KindServiceLab {
		report.addWarning("kind", fmt.Sprintf("unknown kind %q (expected %s or %s)", kind, KindAppDeploy, KindServiceLab))
	}
	if err := ValidateLabSpec(m); err != nil {
		report.addError("lab", err.Error())
	}
	if m.Lab != nil {
		report.LabStepCount = len(m.Lab.Steps)
	}

	for _, step := range m.Build {
		cmd := strings.Join(step.Command, " ")
		if cmd != "" {
			label := step.Name
			if label == "" {
				label = step.DirVar
			}
			report.BuildCommands = append(report.BuildCommands, fmt.Sprintf("%s: %s", label, cmd))
		}
		if strings.TrimSpace(step.DirVar) == "" {
			report.addError("build.dirVar", fmt.Sprintf("build step %q is missing dirVar", step.Name))
		}
		if len(step.Command) == 0 {
			report.addError("build.command", fmt.Sprintf("build step %q has empty command", step.Name))
		}
	}
	for _, step := range m.PostApply {
		cmd := strings.Join(step.Command, " ")
		if cmd != "" {
			label := step.Name
			if label == "" {
				label = step.DirVar
			}
			report.BuildCommands = append(report.BuildCommands, fmt.Sprintf("postApply %s: %s", label, cmd))
		}
	}

	// OpenTofu module inspection (same library as the loader).
	module, diags := tfconfig.LoadModule(dir)
	if diags.HasErrors() {
		report.addError("module.inspect", fmt.Sprintf("inspect OpenTofu module: %s", diags.Err()))
	} else {
		if len(module.ManagedResources) == 0 && len(module.DataResources) == 0 && len(module.ModuleCalls) == 0 {
			report.addWarning("module.empty", "no resources, data sources, or module calls found in .tf files")
		}
		varNames := map[string]struct{}{}
		for name := range module.Variables {
			varNames[name] = struct{}{}
		}
		for _, step := range m.Build {
			if step.DirVar == "" {
				continue
			}
			if _, ok := varNames[step.DirVar]; !ok {
				report.addError("build.dirVar.unknown", fmt.Sprintf("build dirVar %q is not a Terraform variable", step.DirVar))
			}
		}
		for _, step := range m.PostApply {
			if step.DirVar == "" {
				continue
			}
			if _, ok := varNames[step.DirVar]; !ok {
				report.addWarning("postApply.dirVar.unknown", fmt.Sprintf("postApply dirVar %q is not a Terraform variable", step.DirVar))
			}
		}
		if m.ImageBuild != nil {
			if m.ImageBuild.DockerfileDirVar == "" || m.ImageBuild.ImageVar == "" {
				report.addError("imageBuild", "imageBuild requires dockerfileDirVar and imageVar")
			} else {
				if _, ok := varNames[m.ImageBuild.DockerfileDirVar]; !ok {
					report.addError("imageBuild.dockerfileDirVar", fmt.Sprintf("imageBuild.dockerfileDirVar %q is not a Terraform variable", m.ImageBuild.DockerfileDirVar))
				}
				if _, ok := varNames[m.ImageBuild.ImageVar]; !ok {
					report.addError("imageBuild.imageVar", fmt.Sprintf("imageBuild.imageVar %q is not a Terraform variable", m.ImageBuild.ImageVar))
				}
			}
		}
		// Variable group hints that do not map to module variables.
		for _, group := range m.VariableGroups {
			for _, hint := range group.Variables {
				if hint.Name == "" {
					continue
				}
				if _, ok := varNames[hint.Name]; !ok {
					report.addWarning("variableGroups.unknown", fmt.Sprintf("variable group hint %q does not match a Terraform variable", hint.Name))
				}
			}
		}
		// Output hints that do not map to module outputs.
		outNames := map[string]struct{}{}
		for name := range module.Outputs {
			outNames[name] = struct{}{}
		}
		for _, hint := range m.Outputs {
			if hint.Name == "" {
				continue
			}
			if _, ok := outNames[hint.Name]; !ok {
				report.addWarning("outputs.unknown", fmt.Sprintf("output hint %q does not match a Terraform output", hint.Name))
			}
		}
	}

	// Ensure at least one .tf file exists on disk.
	hasTF := false
	entries, _ := os.ReadDir(dir)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if strings.HasSuffix(strings.ToLower(entry.Name()), ".tf") {
			hasTF = true
			break
		}
	}
	if !hasTF {
		// Also allow nested module layouts (subdir with .tf).
		_ = filepath.WalkDir(dir, func(_ string, d os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if d.IsDir() {
				return nil
			}
			if strings.HasSuffix(strings.ToLower(d.Name()), ".tf") {
				hasTF = true
				return filepath.SkipAll
			}
			return nil
		})
	}
	if !hasTF {
		report.addError("module.tf", "no .tf files found in recipe directory")
	}

	report.OK = !report.hasErrors()
	return report, nil
}

func (r *ValidationReport) addError(code, message string) {
	r.Findings = append(r.Findings, Finding{Severity: "error", Code: code, Message: message})
}

func (r *ValidationReport) addWarning(code, message string) {
	r.Findings = append(r.Findings, Finding{Severity: "warning", Code: code, Message: message})
}

func (r ValidationReport) hasErrors() bool {
	for _, f := range r.Findings {
		if f.Severity == "error" {
			return true
		}
	}
	return false
}
