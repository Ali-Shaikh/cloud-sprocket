// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package recipes

import "testing"

func TestBundledCatalogV07(t *testing.T) {
	manifests, err := Bundled().List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(manifests) < 47 {
		t.Fatalf("expected at least 47 bundled recipes, got %d", len(manifests))
	}

	counts := map[string]int{}
	for _, manifest := range manifests {
		counts[manifest.Kind]++
	}
	if counts[KindAppDeploy] < 29 {
		t.Fatalf("expected at least 29 app-deploy recipes, got %d", counts[KindAppDeploy])
	}
	if counts[KindServiceLab] < 18 {
		t.Fatalf("expected at least 18 service-lab recipes, got %d", counts[KindServiceLab])
	}
}