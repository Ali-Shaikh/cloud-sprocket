// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"fmt"
	"strings"
)

// checkRecipeTargetCompat rejects obvious target/recipe mismatches before tofu runs.
func (e *Engine) checkRecipeTargetCompat(deployment *Deployment) error {
	if strings.TrimSpace(deployment.RecipeID) == "" {
		return nil
	}
	recipe, err := e.loader.Load(deployment.RecipeID)
	if err != nil {
		return err
	}

	if !deployment.Local {
		return nil
	}

	runtimeID := resolveRuntimeID(deployment)
	supported := false
	for _, runtime := range recipe.Manifest.Local.Runtimes {
		if strings.TrimSpace(runtime.ID) == runtimeID {
			supported = true
			break
		}
	}
	if supported {
		return nil
	}

	label := runtimeDisplayName(runtimeID)
	return fmt.Errorf(
		"recipe %q does not support a local %s dry-run. Pick a cloud profile instead",
		deployment.RecipeID,
		label,
	)
}

func runtimeDisplayName(runtimeID string) string {
	switch strings.TrimSpace(runtimeID) {
	case "localstack":
		return "LocalStack"
	case "floci-az":
		return "floci-az"
	case "magento-compose":
		return "Magento (Docker Compose)"
	case "docker-compose":
		return "Docker Compose"
	default:
		if runtimeID == "" {
			return "emulator"
		}
		return runtimeID
	}
}