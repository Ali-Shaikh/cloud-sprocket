// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package emulatordocker

// TruncateID shortens a container ID for display (first 12 characters).
func TruncateID(id string) string {
	if len(id) > 12 {
		return id[:12]
	}
	return id
}
