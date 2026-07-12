// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package recipes

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"
)

func writeTrustedImport(t *testing.T, importedRoot, id, version, name string) string {
	t.Helper()
	recipeDir := filepath.Join(importedRoot, id+"@"+version)
	if err := os.MkdirAll(recipeDir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeRecipe(t, recipeDir, `apiVersion: cloudsprocket.recipe/v1
id: `+id+`
version: `+version+`
name: `+name+`
kind: app-deploy
providers: ["aws"]
engine:
  type: opentofu
`, `resource "null_resource" "n" {}
`)
	hash, err := ContentHash(recipeDir)
	if err != nil {
		t.Fatal(err)
	}
	trust, _ := json.Marshal(ImportTrust{ContentHash: hash, ID: id, Version: version})
	if err := os.WriteFile(filepath.Join(recipeDir, TrustFileName()), trust, 0o644); err != nil {
		t.Fatal(err)
	}
	return recipeDir
}

func TestLoaderListsTrustedImports(t *testing.T) {
	importedRoot := t.TempDir()
	recipeDir := writeTrustedImport(t, importedRoot, "imported-demo", "0.1.0", "Imported Demo")

	// Minimal bundled FS with one dummy recipe so List is non-empty from primary.
	fsys := fstest.MapFS{
		"bundled-only/recipe.yaml": &fstest.MapFile{Data: []byte(`apiVersion: cloudsprocket.recipe/v1
id: bundled-only
version: 0.1.0
name: Bundled Only
kind: app-deploy
providers: ["aws"]
engine:
  type: opentofu
`)},
		"bundled-only/main.tf": &fstest.MapFile{Data: []byte(`resource "null_resource" "n" {}`)},
	}
	loader := NewLoader(fsys).WithImportedDir(importedRoot)
	manifests, err := loader.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	foundImported := false
	foundBundled := false
	for _, m := range manifests {
		if m.ID == "imported-demo" {
			foundImported = true
			if m.Source != SourceImported {
				t.Fatalf("imported source = %q", m.Source)
			}
		}
		if m.ID == "bundled-only" {
			foundBundled = true
		}
	}
	if !foundImported {
		t.Fatal("expected imported-demo in catalogue")
	}
	if !foundBundled {
		t.Fatal("expected bundled-only in catalogue")
	}

	recipe, err := loader.Load("imported-demo")
	if err != nil {
		t.Fatalf("Load imported: %v", err)
	}
	if recipe.Manifest.Source != SourceImported {
		t.Fatalf("Load source = %q", recipe.Manifest.Source)
	}

	// Tamper with content → trust fails → recipe disappears.
	if err := os.WriteFile(filepath.Join(recipeDir, "extra.tf"), []byte("resource \"null_resource\" \"x\" {}"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := loader.Load("imported-demo"); err == nil {
		t.Fatal("expected Load to fail after trust hash mismatch")
	}
	manifests, err = loader.List()
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range manifests {
		if m.ID == "imported-demo" {
			t.Fatal("tampered import must not appear in List")
		}
	}
}

// TestLoaderPrefersSemverHighestImport guards the lexicographic trap where
// folder name "id@0.9.0" would beat "id@0.10.0" under string order.
func TestLoaderPrefersSemverHighestImport(t *testing.T) {
	importedRoot := t.TempDir()
	writeTrustedImport(t, importedRoot, "semver-demo", "0.9.0", "Semver Demo 0.9")
	writeTrustedImport(t, importedRoot, "semver-demo", "0.10.0", "Semver Demo 0.10")
	writeTrustedImport(t, importedRoot, "semver-demo", "0.2.0", "Semver Demo 0.2")

	fsys := fstest.MapFS{
		"bundled-only/recipe.yaml": &fstest.MapFile{Data: []byte(`apiVersion: cloudsprocket.recipe/v1
id: bundled-only
version: 0.1.0
name: Bundled Only
kind: app-deploy
providers: ["aws"]
engine:
  type: opentofu
`)},
		"bundled-only/main.tf": &fstest.MapFile{Data: []byte(`resource "null_resource" "n" {}`)},
	}
	loader := NewLoader(fsys).WithImportedDir(importedRoot)

	manifests, err := loader.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	var listed *Manifest
	for i := range manifests {
		if manifests[i].ID == "semver-demo" {
			listed = &manifests[i]
			break
		}
	}
	if listed == nil {
		t.Fatal("expected semver-demo in List")
	}
	if listed.Version != "0.10.0" {
		t.Fatalf("List version = %q, want 0.10.0 (semver max, not lexicographic)", listed.Version)
	}

	recipe, err := loader.Load("semver-demo")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if recipe.Manifest.Version != "0.10.0" {
		t.Fatalf("Load version = %q, want 0.10.0", recipe.Manifest.Version)
	}
	if recipe.Manifest.Name != "Semver Demo 0.10" {
		t.Fatalf("Load name = %q, want Semver Demo 0.10", recipe.Manifest.Name)
	}
}
