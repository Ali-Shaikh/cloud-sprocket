// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const magentoComposeRecipeID = "magento-commerce-compose"

const magentoComposeDebugOverride = `services:
  db:
    ports:
      - "127.0.0.1:3306:3306"
  opensearch:
    ports:
      - "127.0.0.1:9200:9200"
      - "127.0.0.1:9300:9300"
  rabbitmq:
    ports:
      - "127.0.0.1:15672:15672"
      - "127.0.0.1:5672:5672"
`

func renderMagentoComposeWorkspace(workspaceDir string, variables map[string]any) error {
	profile := magentoStringVar(variables, "stack_profile", "simple")
	composeDir := magentoComposeDir(profile)
	if got := strings.TrimSpace(magentoStringVar(variables, "compose_dir", "")); got != "" {
		composeDir = got
	}
	absDir := filepath.Join(workspaceDir, filepath.FromSlash(composeDir))
	if _, err := os.Stat(absDir); err != nil {
		return fmt.Errorf("compose directory %q is missing after materialise: %w", composeDir, err)
	}

	imageChannel := magentoStringVar(variables, "magento_image_channel", "latest")
	imageTag := imageChannel
	if imageTag != "stable" {
		imageTag = "latest"
	}
	baseURL := magentoStringVar(variables, "magento_base_url", "http://localhost:8080")
	envLines := []string{
		"MAGENTO_IMAGE_TAG=" + imageTag,
		"MAGENTO_BASE_URL=" + baseURL,
	}
	if err := os.WriteFile(filepath.Join(absDir, ".env"), []byte(strings.Join(envLines, "\n")+"\n"), 0o644); err != nil {
		return fmt.Errorf("write compose .env: %w", err)
	}

	if profile != "official" {
		return nil
	}

	installLines := []string{
		"MAGENTO_ADMIN_USER=" + magentoStringVar(variables, "magento_admin_user", "admin"),
		"MAGENTO_ADMIN_PASSWORD=" + magentoStringVar(variables, "magento_admin_password", "Admin123!"),
		"MAGENTO_ADMIN_EMAIL=" + magentoStringVar(variables, "magento_admin_email", "admin@example.com"),
		"MAGENTO_BASE_URL=" + baseURL,
	}
	if err := os.WriteFile(filepath.Join(absDir, "install.env"), []byte(strings.Join(installLines, "\n")+"\n"), 0o600); err != nil {
		return fmt.Errorf("write install.env: %w", err)
	}

	publicKey := strings.TrimSpace(magentoStringVar(variables, "magento_public_key", ""))
	privateKey := strings.TrimSpace(magentoStringVar(variables, "magento_private_key", ""))
	authPath := filepath.Join(absDir, "auth.json")
	if publicKey != "" && privateKey != "" {
		auth := map[string]any{
			"http-basic": map[string]any{
				"repo.magento.com": map[string]string{
					"username": publicKey,
					"password": privateKey,
				},
			},
		}
		raw, err := json.Marshal(auth)
		if err != nil {
			return fmt.Errorf("marshal composer auth: %w", err)
		}
		if err := os.WriteFile(authPath, raw, 0o600); err != nil {
			return fmt.Errorf("write auth.json: %w", err)
		}
	} else if err := os.Remove(authPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove auth.json: %w", err)
	}

	overridePath := filepath.Join(absDir, "compose.override.yml")
	if magentoBoolVar(variables, "expose_debug_ports", false) {
		if err := os.WriteFile(overridePath, []byte(magentoComposeDebugOverride), 0o644); err != nil {
			return fmt.Errorf("write compose.override.yml: %w", err)
		}
	} else if err := os.Remove(overridePath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove compose.override.yml: %w", err)
	}
	return nil
}

func magentoComposeDir(profile string) string {
	if profile == "official" {
		return "compose/official"
	}
	return "compose/simple"
}

func magentoStringVar(variables map[string]any, name, fallback string) string {
	if variables == nil {
		return fallback
	}
	raw, ok := variables[name]
	if !ok || raw == nil {
		return fallback
	}
	text := strings.TrimSpace(fmt.Sprint(raw))
	if text == "" {
		return fallback
	}
	return text
}

func magentoBoolVar(variables map[string]any, name string, fallback bool) bool {
	if variables == nil {
		return fallback
	}
	raw, ok := variables[name]
	if !ok || raw == nil {
		return fallback
	}
	switch value := raw.(type) {
	case bool:
		return value
	case string:
		switch strings.ToLower(strings.TrimSpace(value)) {
		case "1", "true", "yes", "on":
			return true
		case "0", "false", "no", "off":
			return false
		}
	}
	return fallback
}