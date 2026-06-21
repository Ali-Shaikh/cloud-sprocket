//go:build windows

package azureadapter

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// The MSI az.cmd shim forwards arguments through %*, which loses embedded
// quotes in KQL on Windows. Invoke the bundled CLI runtime directly instead.
func normaliseCLICommand(name string, args []string) (string, []string) {
	if !strings.EqualFold(name, "az") {
		return name, args
	}
	commandPath, err := exec.LookPath(name)
	if err != nil || !strings.EqualFold(filepath.Ext(commandPath), ".cmd") {
		return name, args
	}
	pythonPath := filepath.Clean(filepath.Join(filepath.Dir(commandPath), "..", "python.exe"))
	info, err := os.Stat(pythonPath)
	if err != nil || info.IsDir() {
		return name, args
	}
	pythonArgs := make([]string, 0, len(args)+2)
	pythonArgs = append(pythonArgs, "-IBm", "azure.cli")
	pythonArgs = append(pythonArgs, args...)
	return pythonPath, pythonArgs
}
