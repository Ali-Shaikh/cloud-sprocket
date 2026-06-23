// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRenderMagentoComposeWorkspaceSimple(t *testing.T) {
	dir := t.TempDir()
	composeDir := filepath.Join(dir, "compose", "simple")
	if err := os.MkdirAll(composeDir, 0o755); err != nil {
		t.Fatal(err)
	}

	vars := map[string]any{
		"stack_profile":         "simple",
		"compose_dir":             "compose/simple",
		"magento_image_channel":   "stable",
		"magento_base_url":        "http://localhost:9090",
	}
	if err := renderMagentoComposeWorkspace(dir, vars); err != nil {
		t.Fatalf("render: %v", err)
	}

	envRaw, err := os.ReadFile(filepath.Join(composeDir, ".env"))
	if err != nil {
		t.Fatalf("read .env: %v", err)
	}
	env := string(envRaw)
	for _, want := range []string{"MAGENTO_IMAGE_TAG=stable", "MAGENTO_BASE_URL=http://localhost:9090"} {
		if !strings.Contains(env, want) {
			t.Fatalf(".env missing %q in %q", want, env)
		}
	}
	if _, err := os.Stat(filepath.Join(composeDir, "auth.json")); err == nil {
		t.Fatal("expected no auth.json for simple profile")
	}
}

func TestRenderMagentoComposeWorkspaceOfficialDebugPorts(t *testing.T) {
	dir := t.TempDir()
	composeDir := filepath.Join(dir, "compose", "official")
	if err := os.MkdirAll(composeDir, 0o755); err != nil {
		t.Fatal(err)
	}

	vars := map[string]any{
		"stack_profile":          "official",
		"compose_dir":              "compose/official",
		"magento_public_key":       "pub-key",
		"magento_private_key":      "priv-key",
		"magento_admin_user":       "shopadmin",
		"magento_admin_password":   "secret",
		"magento_admin_email":      "shop@example.com",
		"expose_debug_ports":       true,
		"magento_base_url":         "http://localhost:8080",
	}
	if err := renderMagentoComposeWorkspace(dir, vars); err != nil {
		t.Fatalf("render: %v", err)
	}

	if _, err := os.Stat(filepath.Join(composeDir, "auth.json")); err != nil {
		t.Fatalf("expected auth.json: %v", err)
	}
	override, err := os.ReadFile(filepath.Join(composeDir, "compose.override.yml"))
	if err != nil {
		t.Fatalf("read override: %v", err)
	}
	if !strings.Contains(string(override), "127.0.0.1:3306:3306") {
		t.Fatalf("override missing debug db port: %s", override)
	}
	install, err := os.ReadFile(filepath.Join(composeDir, "install.env"))
	if err != nil {
		t.Fatalf("read install.env: %v", err)
	}
	if !strings.Contains(string(install), "MAGENTO_ADMIN_USER=shopadmin") {
		t.Fatalf("install.env missing admin user: %s", install)
	}
}