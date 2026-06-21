//go:build !windows

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

func normaliseCLICommand(name string, args []string) (string, []string) {
	return name, args
}
