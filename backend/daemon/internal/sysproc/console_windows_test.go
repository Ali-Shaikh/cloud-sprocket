//go:build windows

package sysproc

import (
	"strings"
	"testing"
)

func TestBuildWindowsCmdLineQuotesAzPathAndResourceID(t *testing.T) {
	line := BuildWindowsCmdLine(
		`C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd`,
		"network", "bastion", "rdp",
		"--name", "erw-prod-vnet-01-bastion",
		"--resource-group", "erw-prod-rg",
		"--target-resource-id", "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/ERW-JUMPBOX",
	)
	if !strings.HasPrefix(line, `call "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"`) {
		t.Fatalf("expected call + quoted az.cmd path, got %q", line)
	}
	if !strings.Contains(line, `--target-resource-id "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/ERW-JUMPBOX"`) {
		t.Fatalf("expected quoted resource ID, got %q", line)
	}
}

func TestBuildInteractiveConsoleCmdUsesNewConsole(t *testing.T) {
	cmd := buildInteractiveConsoleCmd(
		`C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd`,
		"network", "bastion", "rdp",
		"--target-resource-id", "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/ERW-JUMPBOX",
	)
	if cmd == nil {
		t.Fatal("expected command")
	}
	if cmd.SysProcAttr == nil || cmd.SysProcAttr.CreationFlags&createNewConsole == 0 {
		t.Fatal("expected CREATE_NEW_CONSOLE")
	}
	if len(cmd.Args) != 3 || cmd.Args[0] != "cmd.exe" || cmd.Args[1] != "/k" {
		t.Fatalf("unexpected argv: %#v", cmd.Args)
	}
	if !strings.HasPrefix(cmd.Args[2], `call "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"`) {
		t.Fatalf("expected call az.cmd in /k string, got %q", cmd.Args[2])
	}
}

func TestBuildWindowsPowerShellLineUsesCallOperator(t *testing.T) {
	line := BuildWindowsPowerShellLine(
		`C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd`,
		"network", "bastion", "rdp",
		"--target-resource-id", "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/ERW-JUMPBOX",
	)
	if !strings.HasPrefix(line, `& 'C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd'`) {
		t.Fatalf("expected PowerShell call operator, got %q", line)
	}
	if !strings.Contains(line, `'/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/ERW-JUMPBOX'`) {
		t.Fatalf("expected single-quoted resource ID, got %q", line)
	}
}