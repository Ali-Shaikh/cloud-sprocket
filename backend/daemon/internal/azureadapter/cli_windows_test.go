//go:build windows

package azureadapter

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNormaliseCLICommandBypassesAzureCMDShim(t *testing.T) {
	installDir := t.TempDir()
	wbinDir := filepath.Join(installDir, "wbin")
	if err := os.MkdirAll(wbinDir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{filepath.Join(wbinDir, "az.cmd"), filepath.Join(installDir, "python.exe")} {
		if err := os.WriteFile(path, nil, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("PATH", wbinDir)

	query := "AzureDiagnostics\n| where host_s == \"example.test\""
	name, args := normaliseCLICommand("az", []string{"monitor", "log-analytics", "query", "--analytics-query", query})
	if name != filepath.Join(installDir, "python.exe") {
		t.Fatalf("command = %q, want bundled Python", name)
	}
	if len(args) != 7 || args[0] != "-IBm" || args[1] != "azure.cli" || args[6] != query {
		t.Fatalf("unexpected arguments: %#v", args)
	}
}
