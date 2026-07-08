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
		"lab-s3-events-aws",
		"lab-eventbridge-aws",
		"lab-kms-aws",
		"lab-queue-storage-azure",
		"lab-key-vault-azure",
		"lab-functions-http-azure",
		"lab-storage-blobs-azure",
		"lab-logs-aws",
		"lab-api-auth-aws",
		"lab-sns-filtered-fanout-aws",
		"lab-iam-roles-aws",
		"lab-s3-lambda-events-aws",
		"lab-cloudformation-drift-aws",
		"lab-step-functions-aws",
		"lab-storage-event-function-azure",
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

func TestBundledGuidedLabSpecsValidate(t *testing.T) {
	cases := []struct {
		id           string
		minSteps     int
		wantProvider string
	}{
		{id: "lab-queue-worker-aws", minSteps: 4, wantProvider: "aws"},
		{id: "lab-postgres-flexible-azure", minSteps: 3, wantProvider: "azure"},
		{id: "lab-dynamodb-aws", minSteps: 2, wantProvider: "aws"},
		{id: "lab-rest-api-aws", minSteps: 2, wantProvider: "aws"},
		{id: "lab-secrets-aws", minSteps: 2, wantProvider: "aws"},
		{id: "lab-event-fanout-aws", minSteps: 5, wantProvider: "aws"},
		{id: "lab-s3-events-aws", minSteps: 5, wantProvider: "aws"},
		{id: "lab-eventbridge-aws", minSteps: 6, wantProvider: "aws"},
		{id: "lab-kms-aws", minSteps: 4, wantProvider: "aws"},
		{id: "lab-api-auth-aws", minSteps: 5, wantProvider: "aws"},
		{id: "lab-sns-filtered-fanout-aws", minSteps: 5, wantProvider: "aws"},
		{id: "lab-iam-roles-aws", minSteps: 4, wantProvider: "aws"},
		{id: "lab-s3-lambda-events-aws", minSteps: 5, wantProvider: "aws"},
		{id: "lab-queue-storage-azure", minSteps: 4, wantProvider: "azure"},
		{id: "lab-key-vault-azure", minSteps: 4, wantProvider: "azure"},
		{id: "lab-functions-http-azure", minSteps: 4, wantProvider: "azure"},
		{id: "lab-storage-blobs-azure", minSteps: 4, wantProvider: "azure"},
		{id: "lab-logs-aws", minSteps: 3, wantProvider: "aws"},
		{id: "lab-cloudformation-drift-aws", minSteps: 5, wantProvider: "aws"},
		{id: "lab-step-functions-aws", minSteps: 5, wantProvider: "aws"},
		{id: "lab-storage-event-function-azure", minSteps: 5, wantProvider: "azure"},
	}

	for _, tc := range cases {
		t.Run(tc.id, func(t *testing.T) {
			recipe, err := Bundled().Load(tc.id)
			if err != nil {
				t.Fatalf("Load: %v", err)
			}
			lab := recipe.Manifest.Lab
			if lab == nil {
				t.Fatal("expected lab section")
			}
			if len(lab.Steps) < tc.minSteps {
				t.Fatalf("steps = %d, want at least %d", len(lab.Steps), tc.minSteps)
			}
			if len(lab.Objectives) == 0 {
				t.Fatal("expected at least one objective")
			}
			for index, step := range lab.Steps {
				if step.ID == "" {
					t.Fatalf("step %d is missing id", index)
				}
				if step.Title == "" {
					t.Fatalf("step %q is missing title", step.ID)
				}
			}
			if err := ValidateLabSpec(recipe.Manifest); err != nil {
				t.Fatalf("ValidateLabSpec: %v", err)
			}
			if tc.wantProvider == "azure" {
				if len(recipe.Manifest.Providers) != 1 || recipe.Manifest.Providers[0] != "azure" {
					t.Fatalf("providers = %v, want [azure]", recipe.Manifest.Providers)
				}
			}
		})
	}
}