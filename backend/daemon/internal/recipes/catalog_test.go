package recipes

import "testing"

func TestBundledCatalogV06(t *testing.T) {
	manifests, err := Bundled().List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(manifests) < 11 {
		t.Fatalf("expected at least 11 bundled recipes, got %d", len(manifests))
	}

	counts := map[string]int{}
	for _, manifest := range manifests {
		counts[manifest.Kind]++
		switch manifest.ID {
		case "serverless-fullstack-aws", "container-fullstack-aws", "static-site-aws",
			"api-postgres-serverless-aws", "api-postgres-containers-aws", "fullstack-postgres-serverless-aws":
			if !manifest.Superpowers.IamPolicyStream {
				t.Fatalf("%s should declare iamPolicyStream", manifest.ID)
			}
		}
	}
	if counts[KindAppDeploy] < 8 {
		t.Fatalf("expected at least 8 app-deploy recipes, got %d", counts[KindAppDeploy])
	}
	if counts[KindServiceLab] < 3 {
		t.Fatalf("expected at least 3 service-lab recipes, got %d", counts[KindServiceLab])
	}
}