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