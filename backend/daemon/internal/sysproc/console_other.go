//go:build !windows

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package sysproc

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
)

// SpawnInteractiveConsole opens a terminal emulator running command with args.
func SpawnInteractiveConsole(_ context.Context, command string, args ...string) error {
	command = strings.TrimSpace(command)
	if command == "" {
		return fmt.Errorf("command is required")
	}
	shellLine := shellQuote(command)
	for _, arg := range args {
		shellLine += " " + shellQuote(arg)
	}
	shellLine += "; exec ${SHELL:-/bin/sh}"

	terminals := [][]string{
		{"x-terminal-emulator", "-e", "bash", "-lc", shellLine},
		{"gnome-terminal", "--", "bash", "-lc", shellLine},
		{"konsole", "-e", "bash", "-lc", shellLine},
		{"xfce4-terminal", "-e", "bash", "-lc", shellLine},
	}
	for _, spec := range terminals {
		if _, err := exec.LookPath(spec[0]); err != nil {
			continue
		}
		cmd := exec.Command(spec[0], spec[1:]...)
		if err := cmd.Start(); err == nil {
			return nil
		}
	}
	return fmt.Errorf("no supported terminal emulator found to launch Bastion connect")
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", `'"'"'`) + "'"
}