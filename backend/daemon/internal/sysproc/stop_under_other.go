//go:build !windows

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package sysproc

// StopProcessesUnder is a no-op on non-Windows platforms.
func StopProcessesUnder(dir string) int {
	return 0
}
