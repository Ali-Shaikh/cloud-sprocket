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
func SpawnInteractiveConsole(ctx context.Context, command string, args ...string) error {
	command = strings.TrimSpace(command)
	if command == "" {
		return fmt.Errorf("command is required")
	}
	inner := BuildWindowsCmdLine(command, args...)
	// An empty window title (`start ""`) is required when the executable path is
	// quoted or contains spaces. Otherwise `start` treats the title string as the
	// program name ("cannot find CloudSprocket Bastion").
	script := `start "" cmd /k ` + inner
	cmd := exec.CommandContext(ctx, "cmd.exe", "/c", script)
	return cmd.Start()
}