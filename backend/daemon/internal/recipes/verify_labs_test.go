// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package recipes

import "testing"

func TestLoadLabRecipes(t *testing.T) {
	for _, id := range []string{
		"lab-rest-api-aws",
		"lab-queue-worker-aws",
		"lab-dynamodb-aws",
		"lab-event-fanout-aws",
		"lab-secrets-aws",
	} {
		recipe, err := Bundled().Load(id)
		if err != nil {
			t.Fatalf("Load %s: %v", id, err)
		}
		if recipe.Manifest.Kind != KindServiceLab {
			t.Fatalf("%s kind = %q, want %q", id, recipe.Manifest.Kind, KindServiceLab)
		}
		if recipe.Manifest.Local.RequiresPro {
			t.Fatalf("%s should not require LocalStack Pro", id)
		}
		if recipe.Manifest.Superpowers.IamPolicyStream {
			t.Fatalf("%s should not declare superpowers", id)
		}
	}
}