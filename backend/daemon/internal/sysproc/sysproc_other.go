//go:build !windows

package sysproc

import "os/exec"

// Hide is a no-op on non-Windows platforms, where spawning a CLI tool does not
// open a console window.
func Hide(_ *exec.Cmd) {}
