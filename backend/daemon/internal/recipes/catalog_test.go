package recipes

import "testing"

func TestBundledCatalogV07(t *testing.T) {
	manifests, err := Bundled().List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(manifests) < 16 {
		t.Fatalf("expected at least 16 bundled recipes, got %d", len(manifests))
	}

	counts := map[string]int{}
	for _, manifest := range manifests {
		counts[manifest.Kind]++
	}
	if counts[KindAppDeploy] < 10 {
		t.Fatalf("expected at least 10 app-deploy recipes, got %d", counts[KindAppDeploy])
	}
	if counts[KindServiceLab] < 6 {
		t.Fatalf("expected at least 6 service-lab recipes, got %d", counts[KindServiceLab])
	}
}