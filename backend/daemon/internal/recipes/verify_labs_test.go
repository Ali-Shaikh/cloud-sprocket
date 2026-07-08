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
		"lab-postgres-flexible-azure",
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

func TestLabQueueWorkerHasLabSection(t *testing.T) {
	recipe, err := Bundled().Load("lab-queue-worker-aws")
	if err != nil {
		t.Fatalf("Load lab-queue-worker-aws: %v", err)
	}
	lab := recipe.Manifest.Lab
	if lab == nil {
		t.Fatal("expected lab section on lab-queue-worker-aws")
	}
	if lab.Difficulty != LabDifficultyBeginner {
		t.Fatalf("difficulty = %q, want %q", lab.Difficulty, LabDifficultyBeginner)
	}
	if len(lab.Steps) != 4 {
		t.Fatalf("steps = %d, want 4", len(lab.Steps))
	}
	wantStepIDs := []string{"explore-queue", "send-message", "verify-queue", "inspect-lambda"}
	for index, wantID := range wantStepIDs {
		if lab.Steps[index].ID != wantID {
			t.Fatalf("step[%d].id = %q, want %q", index, lab.Steps[index].ID, wantID)
		}
		if lab.Steps[index].Title == "" {
			t.Fatalf("step %q is missing title", wantID)
		}
	}
	if err := ValidateLabSpec(recipe.Manifest); err != nil {
		t.Fatalf("ValidateLabSpec: %v", err)
	}
}