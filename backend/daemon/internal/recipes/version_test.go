// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package recipes

import "testing"

func TestCompareVersionsPrefersSemverOrder(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		a, b string
		want int
	}{
		{name: "patch bump", a: "0.9.1", b: "0.9.0", want: 1},
		{name: "minor vs double-digit patch trap", a: "0.10.0", b: "0.9.0", want: 1},
		{name: "lexicographic trap reversed", a: "0.9.0", b: "0.10.0", want: -1},
		{name: "equal without v prefix", a: "1.2.3", b: "1.2.3", want: 0},
		{name: "leading v accepted", a: "v1.2.0", b: "1.1.9", want: 1},
		{name: "prerelease lower than release", a: "1.0.0-alpha", b: "1.0.0", want: -1},
		{name: "semver beats free-form", a: "1.0.0", b: "latest", want: 1},
		{name: "free-form fallback", a: "beta", b: "alpha", want: 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := CompareVersions(tc.a, tc.b)
			if got != tc.want {
				t.Fatalf("CompareVersions(%q, %q) = %d, want %d", tc.a, tc.b, got, tc.want)
			}
			if tc.want > 0 && !VersionGreater(tc.a, tc.b) {
				t.Fatalf("VersionGreater(%q, %q) = false, want true", tc.a, tc.b)
			}
			if tc.want < 0 && VersionGreater(tc.a, tc.b) {
				t.Fatalf("VersionGreater(%q, %q) = true, want false", tc.a, tc.b)
			}
		})
	}
}
