// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import "testing"

func TestClampAzurePresignDuration(t *testing.T) {
	cases := []struct {
		in   int
		want int
	}{
		{0, 3600},
		{-1, 3600},
		{30, 60},
		{120, 120},
		{3600, 3600},
		{8 * 24 * 60 * 60, 7 * 24 * 60 * 60},
	}
	for _, tc := range cases {
		if got := clampAzurePresignDuration(tc.in); got != tc.want {
			t.Fatalf("clampAzurePresignDuration(%d) = %d, want %d", tc.in, got, tc.want)
		}
	}
}
