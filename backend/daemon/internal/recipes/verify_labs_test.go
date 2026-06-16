package recipes

import "testing"

func TestLoadLabRecipes(t *testing.T) {
	for _, id := range []string{"lab-rest-api-aws", "lab-queue-worker-aws"} {
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
		if recipe.Manifest.Superpowers.IamPolicyStream || recipe.Manifest.Superpowers.CloudPod {
			t.Fatalf("%s should not declare superpowers", id)
		}
	}
}