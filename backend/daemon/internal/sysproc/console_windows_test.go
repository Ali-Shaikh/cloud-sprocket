//go:build windows

package sysproc

import (
	"strings"
	"testing"
)

func TestBuildWindowsCommandLineQuotesAzPath(t *testing.T) {
	line := buildWindowsCommandLine(
		`C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd`,
		"network", "bastion", "rdp",
		"--name", "erw-prod-vnet-01-bastion",
		"--resource-group", "erw-prod-rg",
		"--target-resource-id", "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/vm",
	)
	if !strings.HasPrefix(line, `call "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"`) {
		t.Fatalf("expected call + quoted az.cmd path, got %q", line)
	}
	if !strings.Contains(line, `--name erw-prod-vnet-01-bastion`) {
		t.Fatalf("expected bastion args in command line, got %q", line)
	}
}

func TestQuoteWindowsArg(t *testing.T) {
	if quoteWindowsArg("plain") != "plain" {
		t.Fatal("expected plain token to stay unquoted")
	}
	if quoteWindowsArg(`C:\Program Files\az.cmd`) != `"C:\Program Files\az.cmd"` {
		t.Fatal("expected spaced path to be quoted")
	}
}