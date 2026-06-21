//go:build !windows

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package sysproc

import "os/exec"

// Hide is a no-op on non-Windows platforms, where spawning a CLI tool does not
// open a console window.
func Hide(_ *exec.Cmd) {}
