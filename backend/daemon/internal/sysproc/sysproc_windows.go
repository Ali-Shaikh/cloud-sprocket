//go:build windows

// Package sysproc configures spawned child processes so the GUI-subsystem daemon
// does not flash a console window when it runs CLI tools (tofu, npm, az).
package sysproc

import (
	"os/exec"
	"syscall"
)

// createNoWindow is the Windows CREATE_NO_WINDOW process-creation flag, which
// runs a console child without allocating a visible console window.
const createNoWindow = 0x08000000

// Hide configures cmd to run without opening a console window.
func Hide(cmd *exec.Cmd) {
	if cmd == nil {
		return
	}
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.HideWindow = true
	cmd.SysProcAttr.CreationFlags |= createNoWindow
}
