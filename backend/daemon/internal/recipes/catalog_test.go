// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package recipes

import "testing"

func TestBundledCatalogV07(t *testing.T) {
	manifests, err := Bundled().List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(manifests) < 20 {
		t.Fatalf("expected at least 20 bundled recipes, got %d", len(manifests))
	}

	counts := map[string]int{}
	for _, manifest := range manifests {
		counts[manifest.Kind]++
	}
	if counts[KindAppDeploy] < 14 {
		t.Fatalf("expected at least 14 app-deploy recipes, got %d", counts[KindAppDeploy])
	}
	if counts[KindServiceLab] < 6 {
		t.Fatalf("expected at least 6 service-lab recipes, got %d", counts[KindServiceLab])
	}
}