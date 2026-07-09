// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package recipes

import (
	"os"
	"path/filepath"
	"testing"
)

func TestValidateDirectoryOK(t *testing.T) {
	dir := t.TempDir()
	writeRecipe(t, dir, `apiVersion: cloudsprocket.recipe/v1
id: demo-ok
version: 0.1.0
name: Demo OK
kind: app-deploy
providers: ["aws"]
engine:
  type: opentofu
  minVersion: "1.6.0"
variables: []
`, `variable "app_name" { type = string }
resource "null_resource" "n" {}
output "id" { value = "x" }
`)
	report, err := ValidateDirectory(dir)
	if err != nil {
		t.Fatalf("ValidateDirectory: %v", err)
	}
	if !report.OK {
		t.Fatalf("expected ok report, findings=%+v", report.Findings)
	}
	if report.ID != "demo-ok" {
		t.Fatalf("id=%q", report.ID)
	}
}

func TestValidateDirectoryMissingManifest(t *testing.T) {
	dir := t.TempDir()
	report, err := ValidateDirectory(dir)
	if err != nil {
		t.Fatalf("ValidateDirectory: %v", err)
	}
	if report.OK {
		t.Fatal("expected not ok")
	}
}

func TestValidateDirectoryUnknownBuildDirVar(t *testing.T) {
	dir := t.TempDir()
	writeRecipe(t, dir, `apiVersion: cloudsprocket.recipe/v1
id: demo-bad-build
version: 0.1.0
name: Demo Bad Build
kind: app-deploy
providers: ["aws"]
engine:
  type: opentofu
build:
  - name: install
    dirVar: missing_dir
    command: ["npm", "ci"]
`, `resource "null_resource" "n" {}
`)
	report, err := ValidateDirectory(dir)
	if err != nil {
		t.Fatalf("ValidateDirectory: %v", err)
	}
	if report.OK {
		t.Fatal("expected not ok for unknown dirVar")
	}
	found := false
	for _, f := range report.Findings {
		if f.Code == "build.dirVar.unknown" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected build.dirVar.unknown finding, got %+v", report.Findings)
	}
	if len(report.BuildCommands) == 0 {
		t.Fatal("expected build commands on report for trust preview")
	}
}

func writeRecipe(t *testing.T, dir, yaml, mainTf string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, "recipe.yaml"), []byte(yaml), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "main.tf"), []byte(mainTf), 0o644); err != nil {
		t.Fatal(err)
	}
}
