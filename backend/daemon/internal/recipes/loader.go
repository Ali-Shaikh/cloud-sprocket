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
	"strings"

	"github.com/hashicorp/terraform-config-inspect/tfconfig"
	"gopkg.in/yaml.v3"
)

const manifestFile = "recipe.yaml"

// Source labels where a recipe came from (gallery badges / trust).
const (
	SourceBundled  = "bundled"
	SourceImported = "imported"
)

// Loader lists and loads recipes from a filesystem whose root contains one
// directory per recipe. Bundled recipes use an embedded FS; ImportedDir is
// scanned as a second source (C2) when set.
type Loader struct {
	fsys        fs.FS
	importedDir string
}

// NewLoader builds a loader over a recipe-root filesystem.
func NewLoader(fsys fs.FS) *Loader {
	return &Loader{fsys: fsys}
}

// WithImportedDir returns a shallow copy that also lists/loads trusted recipes
// from ImportedRecipesDir (folders named id@version with a valid trust hash).
func (l *Loader) WithImportedDir(dir string) *Loader {
	if l == nil {
		return &Loader{importedDir: dir}
	}
	clone := *l
	clone.importedDir = strings.TrimSpace(dir)
	return &clone
}

// List returns the manifest of every recipe found at the root, plus trusted
// imports (imported wins on ID collision so user copies override bundled).
func (l *Loader) List() ([]Manifest, error) {
	entries, err := fs.ReadDir(l.fsys, ".")
	if err != nil {
		return nil, fmt.Errorf("read recipes: %w", err)
	}
	byID := map[string]Manifest{}
	order := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		manifest, err := l.readManifest(entry.Name())
		if err != nil {
			return nil, err
		}
		manifest.Source = SourceBundled
		byID[manifest.ID] = manifest
		order = append(order, manifest.ID)
	}
	imported, err := l.listImported()
	if err != nil {
		return nil, err
	}
	for _, manifest := range imported {
		if _, exists := byID[manifest.ID]; !exists {
			order = append(order, manifest.ID)
		}
		byID[manifest.ID] = manifest
	}
	manifests := make([]Manifest, 0, len(order))
	for _, id := range order {
		manifests = append(manifests, byID[id])
	}
	sort.Slice(manifests, func(left, right int) bool {
		return manifests[left].Name < manifests[right].Name
	})
	return manifests, nil
}

// Load resolves a single recipe: its manifest plus variables and outputs
// introspected from the Terraform configuration, merged with the UI hints.
// Trusted imports override the bundled recipe with the same id.
func (l *Loader) Load(id string) (Recipe, error) {
	if dir, ok := l.findImportedDir(id); ok {
		return LoadFromDirectory(dir, SourceImported)
	}
	manifest, err := l.readManifest(id)
	if err != nil {
		return Recipe{}, err
	}
	manifest.Source = SourceBundled

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
	if dir, ok := l.findImportedDir(id); ok {
		return copyDirTree(dir, destDir)
	}
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

// LoadFromDirectory loads a recipe from an on-disk folder (import or materialised path).
func LoadFromDirectory(dir, source string) (Recipe, error) {
	manifest, err := readManifestFromDirectory(dir, source)
	if err != nil {
		return Recipe{}, err
	}
	module, diags := tfconfig.LoadModule(dir)
	if diags.HasErrors() {
		return Recipe{}, fmt.Errorf("inspect recipe %q: %s", manifest.ID, diags.Err())
	}
	return Recipe{
		Manifest:  manifest,
		Variables: mergeVariables(module, manifest),
		Outputs:   mergeOutputs(module, manifest),
	}, nil
}

func (l *Loader) listImported() ([]Manifest, error) {
	if strings.TrimSpace(l.importedDir) == "" {
		return nil, nil
	}
	info, err := os.Stat(l.importedDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read imported recipes: %w", err)
	}
	if !info.IsDir() {
		return nil, nil
	}
	entries, err := os.ReadDir(l.importedDir)
	if err != nil {
		return nil, fmt.Errorf("read imported recipes: %w", err)
	}
	// Prefer highest semantic version per recipe id when several imports exist.
	// Cache the light manifest so we only parse recipe.yaml once per winner (no
	// second tfconfig pass during List). Folder-name lexicographic order is not
	// used: "0.10.0" must beat "0.9.0".
	type candidate struct {
		dir      string
		manifest Manifest
	}
	best := map[string]candidate{}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		dir := filepath.Join(l.importedDir, entry.Name())
		if !TrustValid(dir) {
			continue
		}
		manifest, err := readManifestFromDirectory(dir, SourceImported)
		if err != nil {
			// Skip corrupt imports rather than failing the whole catalogue.
			continue
		}
		id := manifest.ID
		if prev, ok := best[id]; !ok || VersionGreater(manifest.Version, prev.manifest.Version) {
			best[id] = candidate{dir: dir, manifest: manifest}
		}
	}
	manifests := make([]Manifest, 0, len(best))
	for _, c := range best {
		manifests = append(manifests, c.manifest)
	}
	return manifests, nil
}

func (l *Loader) findImportedDir(id string) (string, bool) {
	if strings.TrimSpace(l.importedDir) == "" || strings.TrimSpace(id) == "" {
		return "", false
	}
	entries, err := os.ReadDir(l.importedDir)
	if err != nil {
		return "", false
	}
	var bestDir string
	var bestVersion string
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if name != id && !strings.HasPrefix(name, id+"@") {
			continue
		}
		dir := filepath.Join(l.importedDir, name)
		if !TrustValid(dir) {
			continue
		}
		// Light manifest read only (avoid full module inspect until Load).
		manifest, err := readManifestFromDirectory(dir, SourceImported)
		if err != nil || manifest.ID != id {
			continue
		}
		if bestDir == "" || VersionGreater(manifest.Version, bestVersion) {
			bestDir = dir
			bestVersion = manifest.Version
		}
	}
	if bestDir == "" {
		return "", false
	}
	return bestDir, true
}

// readManifestFromDirectory parses recipe.yaml without inspecting the OpenTofu
// module (used for catalogue listing and import discovery).
func readManifestFromDirectory(dir, source string) (Manifest, error) {
	data, err := os.ReadFile(filepath.Join(dir, manifestFile))
	if err != nil {
		return Manifest{}, fmt.Errorf("read manifest in %s: %w", dir, err)
	}
	var manifest Manifest
	if err := yaml.Unmarshal(data, &manifest); err != nil {
		return Manifest{}, fmt.Errorf("parse manifest in %s: %w", dir, err)
	}
	if strings.TrimSpace(manifest.ID) == "" {
		manifest.ID = filepath.Base(dir)
	}
	if err := manifest.Validate(); err != nil {
		return Manifest{}, err
	}
	if err := ValidateLabSpec(manifest); err != nil {
		return Manifest{}, err
	}
	NormalizeManifest(&manifest)
	if strings.TrimSpace(source) == "" {
		source = SourceImported
	}
	manifest.Source = source
	return manifest, nil
}

func copyDirTree(src, dest string) error {
	cleanDest := filepath.Clean(dest)
	return filepath.WalkDir(src, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		if shouldSkipImportRel(rel) {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if filepath.Base(rel) == trustFileName {
			return nil
		}
		tgt := filepath.Join(dest, rel)
		if !strings.HasPrefix(filepath.Clean(tgt), cleanDest+string(os.PathSeparator)) && filepath.Clean(tgt) != cleanDest {
			return fmt.Errorf("refusing to write outside destination: %s", rel)
		}
		if d.IsDir() {
			return os.MkdirAll(tgt, 0o755)
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(tgt), 0o755); err != nil {
			return err
		}
		return os.WriteFile(tgt, b, 0o644)
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
	if manifest.Source == "" {
		manifest.Source = SourceBundled
	}
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
