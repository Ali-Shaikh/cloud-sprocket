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

	runtimeID := resolveRuntimeID(deployment)
	if deployment.ProviderID == "azure" && deployment.Local && runtimeID == "floci-az" {
		supported := false
		for _, runtime := range recipe.Manifest.Local.Runtimes {
			if strings.TrimSpace(runtime.ID) == "floci-az" {
				supported = true
				break
			}
		}
		if !supported {
			return fmt.Errorf(
				"recipe %q does not support a local floci-az dry-run. Pick a cloud Azure subscription profile instead",
				deployment.RecipeID,
			)
		}
	}

	return nil
}