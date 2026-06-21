//go:build windows

package sysproc

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"syscall"
)

// SpawnInteractiveConsole opens a new visible console running command with args.
// Used for interactive Azure Bastion SSH/RDP sessions via the local az CLI.
func SpawnInteractiveConsole(_ context.Context, command string, args ...string) error {
	cmd := buildInteractiveConsoleCmd(command, args...)
	if cmd == nil {
		return fmt.Errorf("command is required")
	}
	return cmd.Start()
}

func buildInteractiveConsoleCmd(command string, args ...string) *exec.Cmd {
	command = strings.TrimSpace(command)
	if command == "" {
		return nil
	}
	inner := BuildWindowsCmdLine(command, args...)
	// cmd /k keeps the window open for the blocking az bastion session.
	cmd := exec.Command("cmd.exe", "/k", inner)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: createNewConsole,
	}
	return cmd
}