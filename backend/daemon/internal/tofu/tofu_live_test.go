package tofu

import (
	"context"
	"os"
	"strings"
	"testing"
)

// TestLiveInstallAndVersion downloads the real pinned OpenTofu release from
// GitHub, verifies its checksum, extracts it, and runs `tofu version`. It is
// gated behind TOFU_LIVE so it never runs in the normal suite (it needs network
// and pulls tens of MB).
func TestLiveInstallAndVersion(t *testing.T) {
	if os.Getenv("TOFU_LIVE") == "" {
		t.Skip("set TOFU_LIVE=1 to download and run the real OpenTofu release")
	}
	in := NewInstaller(t.TempDir())
	path, err := in.Ensure(context.Background())
	if err != nil {
		t.Fatalf("Ensure: %v", err)
	}
	t.Logf("installed tofu at %s", path)

	version, err := NewRunner(path).Version(context.Background())
	if err != nil {
		t.Fatalf("Version: %v", err)
	}
	t.Logf("tofu version: %s", version)
	if !strings.Contains(version, DefaultVersion) {
		t.Fatalf("version %q does not contain pinned %q", version, DefaultVersion)
	}
}
