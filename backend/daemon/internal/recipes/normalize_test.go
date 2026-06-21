// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package recipes

import "testing"

func TestNormalizeManifestInfersKind(t *testing.T) {
	cases := []struct {
		id   string
		want string
	}{
		{"api-postgres-serverless-aws", KindAppDeploy},
		{"lab-queue-worker-aws", KindServiceLab},
		{"scheduled-job-aws", KindServiceLab},
	}
	for _, tc := range cases {
		m := Manifest{ID: tc.id}
		NormalizeManifest(&m)
		if m.Kind != tc.want {
			t.Fatalf("kind for %q = %q, want %q", tc.id, m.Kind, tc.want)
		}
	}
}

func TestNormalizeManifestLegacyLocalRuntime(t *testing.T) {
	m := Manifest{
		Local: LocalSpec{Emulator: "localstack", RequiresPro: true},
	}
	NormalizeManifest(&m)
	if len(m.Local.Runtimes) != 1 {
		t.Fatalf("expected one runtime, got %d", len(m.Local.Runtimes))
	}
	if m.Local.Runtimes[0].ID != RuntimeLocalStack || !m.Local.Runtimes[0].RequiresPro {
		t.Fatalf("unexpected runtime: %+v", m.Local.Runtimes[0])
	}
}

func TestRequiresLocalStackProFromRuntimes(t *testing.T) {
	m := Manifest{
		Local: LocalSpec{
			Runtimes: []LocalRuntimeSpec{{ID: RuntimeLocalStack, RequiresPro: true}},
		},
	}
	if !m.RequiresLocalStackPro() {
		t.Fatal("expected RequiresLocalStackPro true")
	}
}