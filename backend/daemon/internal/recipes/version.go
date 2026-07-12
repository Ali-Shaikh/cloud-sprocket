// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package recipes

import (
	"strings"

	"golang.org/x/mod/semver"
)

// CompareVersions compares two recipe manifest versions using semantic
// versioning. Returns -1 if a < b, 0 if equal, +1 if a > b.
//
// Versions may be written with or without a leading "v" (manifests use
// "0.1.0"). Non-semver strings fall back to lexicographic comparison so
// odd labels still order stably.
func CompareVersions(a, b string) int {
	a = strings.TrimSpace(a)
	b = strings.TrimSpace(b)
	if a == b {
		return 0
	}
	va, aOK := canonicalSemver(a)
	vb, bOK := canonicalSemver(b)
	switch {
	case aOK && bOK:
		return semver.Compare(va, vb)
	case aOK && !bOK:
		// Prefer a real semver over a free-form label.
		return 1
	case !aOK && bOK:
		return -1
	default:
		if a < b {
			return -1
		}
		if a > b {
			return 1
		}
		return 0
	}
}

// VersionGreater reports whether a is a higher version than b.
func VersionGreater(a, b string) bool {
	return CompareVersions(a, b) > 0
}

func canonicalSemver(v string) (string, bool) {
	v = strings.TrimSpace(v)
	if v == "" {
		return "", false
	}
	if v[0] != 'v' && v[0] != 'V' {
		v = "v" + v
	} else if v[0] == 'V' {
		v = "v" + v[1:]
	}
	if !semver.IsValid(v) {
		return "", false
	}
	return v, true
}
