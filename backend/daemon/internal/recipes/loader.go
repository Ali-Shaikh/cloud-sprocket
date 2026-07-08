// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package recipes

import (
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"

	"github.com/hashicorp/terraform-config-inspect/tfconfig"
	"gopkg.in/yaml.v3"
)

const manifestFile = "recipe.yaml"

// Loader lists and loads recipes from a filesystem whose root contains one
// directory per recipe. Bundled recipes use an embedded FS; a future registry
// can supply a different FS over the same API.
type Loader struct {
	fsys fs.FS
}

// NewLoader builds a loader over a recipe-root filesystem.
func NewLoader(fsys fs.FS) *Loader {
	return &Loader{fsys: fsys}
}

// List returns the manifest of every recipe found at the root.
func (l *Loader) List() ([]Manifest, error) {
	entries, err := fs.ReadDir(l.fsys, ".")
	if err != nil {
		return nil, fmt.Errorf("read recipes: %w", err)
	}
	manifests := make([]Manifest, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		manifest, err := l.readManifest(entry.Name())
		if err != nil {
			return nil, err
		}
		manifests = append(manifests, manifest)
	}
	sort.Slice(manifests, func(left, right int) bool {
		return manifests[left].Name < manifests[right].Name
	})
	return manifests, nil
}

// Load resolves a single recipe: its manifest plus variables and outputs
// introspected from the Terraform configuration, merged with the UI hints.
func (l *Loader) Load(id string) (Recipe, error) {
	manifest, err := l.readManifest(id)
	if err != nil {
		return Recipe{}, err
	}

	sub, err := fs.Sub(l.fsys, id)
	if err != nil {
		return Recipe{}, fmt.Errorf("recipe %q: %w", id, err)
	}
	module, diags := tfconfig.LoadModuleFromFilesystem(tfconfig.WrapFS(sub), ".")
	if diags.HasErrors() {
		return Recipe{}, fmt.Errorf("inspect recipe %q: %s", id, diags.Err())
	}

	return Recipe{
		Manifest:  manifest,
		Variables: mergeVariables(module, manifest),
		Outputs:   mergeOutputs(module, manifest),
	}, nil
}

// Materialise copies a recipe's files onto the local filesystem so the engine
// can run against them.
func (l *Loader) Materialise(id, destDir string) error {
	sub, err := fs.Sub(l.fsys, id)
	if err != nil {
		return fmt.Errorf("recipe %q: %w", id, err)
	}
	return fs.WalkDir(sub, ".", func(name string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		target := filepath.Join(destDir, filepath.FromSlash(name))
		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		data, err := fs.ReadFile(sub, name)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		return os.WriteFile(target, data, 0o644)
	})
}

func (l *Loader) readManifest(id string) (Manifest, error) {
	data, err := fs.ReadFile(l.fsys, path.Join(id, manifestFile))
	if err != nil {
		return Manifest{}, fmt.Errorf("read manifest for %q: %w", id, err)
	}
	var manifest Manifest
	if err := yaml.Unmarshal(data, &manifest); err != nil {
		return Manifest{}, fmt.Errorf("parse manifest for %q: %w", id, err)
	}
	if manifest.ID == "" {
		manifest.ID = id
	}
	if err := manifest.Validate(); err != nil {
		return Manifest{}, err
	}
	if err := ValidateLabSpec(manifest); err != nil {
		return Manifest{}, err
	}
	NormalizeManifest(&manifest)
	return manifest, nil
}

func mergeVariables(module *tfconfig.Module, manifest Manifest) []Variable {
	hints, groupOf, order := hintIndex(manifest)

	variables := make([]Variable, 0, len(module.Variables))
	for name, tfVar := range module.Variables {
		variable := Variable{
			Name:        name,
			Type:        tfVar.Type,
			Description: tfVar.Description,
			Default:     tfVar.Default,
			Required:    tfVar.Required,
			Sensitive:   tfVar.Sensitive,
			Group:       defaultGroup,
		}
		if group, ok := groupOf[name]; ok {
			variable.Group = group
		}
		if hint, ok := hints[name]; ok {
			variable.Options = hint.Options
			variable.Help = hint.Help
			variable.VisibleWhen = hint.VisibleWhen
			if hint.Widget != "" {
				variable.Widget = hint.Widget
			}
		}
		if variable.Widget == "" {
			variable.Widget = inferWidget(variable)
		}
		variables = append(variables, variable)
	}

	sort.SliceStable(variables, func(left, right int) bool {
		li, lok := order[variables[left].Name]
		ri, rok := order[variables[right].Name]
		switch {
		case lok && rok:
			return li < ri
		case lok != rok:
			return lok // hinted variables come before un-hinted ones
		default:
			return variables[left].Name < variables[right].Name
		}
	})
	return variables
}

func mergeOutputs(module *tfconfig.Module, manifest Manifest) []Output {
	primary := map[string]bool{}
	order := map[string]int{}
	for index, hint := range manifest.Outputs {
		primary[hint.Name] = hint.Primary
		order[hint.Name] = index
	}

	outputs := make([]Output, 0, len(module.Outputs))
	for name, tfOut := range module.Outputs {
		outputs = append(outputs, Output{
			Name:        name,
			Description: tfOut.Description,
			Sensitive:   tfOut.Sensitive,
			Primary:     primary[name],
		})
	}
	sort.SliceStable(outputs, func(left, right int) bool {
		li, lok := order[outputs[left].Name]
		ri, rok := order[outputs[right].Name]
		switch {
		case lok && rok:
			return li < ri
		case lok != rok:
			return lok
		default:
			return outputs[left].Name < outputs[right].Name
		}
	})
	return outputs
}

// hintIndex flattens the manifest's variable groups into lookup maps for the
// hint, the owning group title, and the declared display order.
func hintIndex(manifest Manifest) (map[string]VariableHint, map[string]string, map[string]int) {
	hints := map[string]VariableHint{}
	groupOf := map[string]string{}
	order := map[string]int{}
	position := 0
	for _, group := range manifest.VariableGroups {
		for _, hint := range group.Variables {
			hints[hint.Name] = hint
			groupOf[hint.Name] = group.Title
			order[hint.Name] = position
			position++
		}
	}
	return hints, groupOf, order
}
