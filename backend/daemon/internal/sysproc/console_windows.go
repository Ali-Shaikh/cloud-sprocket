//go:build windows

package sysproc

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
)

// SpawnInteractiveConsole opens a new visible console running command with args.
// Used for interactive Azure Bastion SSH/RDP sessions via the local az CLI.
func SpawnInteractiveConsole(_ context.Context, command string, args ...string) error {
	command = strings.TrimSpace(command)
	if command == "" {
		return fmt.Errorf("command is required")
	}
	parts := make([]string, 0, len(args)+1)
	parts = append(parts, command)
	parts = append(parts, args...)
	line := strings.Join(parts, " ")
	// `start "title" cmd /k` opens a new console; `/k` keeps it open after az exits or errors.
	script := `start "CloudSprocket Bastion" cmd /k ` + line
	cmd := exec.Command("cmd.exe", "/c", script)
	return cmd.Start()
}

func quoteWindowsArg(value string) string {
	if value == "" {
		return `""`
	}
	if !strings.ContainsAny(value, " \t\"") {
		return value
	}
	return `"` + strings.ReplaceAll(value, `"`, `\"`) + `"`
}