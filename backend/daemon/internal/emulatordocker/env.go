// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package emulatordocker

// ValidEnvName reports whether value is a safe environment variable name
// (POSIX-style: letter or underscore first, then alphanumerics or underscores).
func ValidEnvName(value string) bool {
	if value == "" {
		return false
	}
	for index, r := range value {
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || r == '_' || (index > 0 && r >= '0' && r <= '9') {
			continue
		}
		return false
	}
	return true
}
