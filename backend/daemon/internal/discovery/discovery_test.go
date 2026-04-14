package discovery

import (
	"os"
	"path/filepath"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
)

func TestDiscoverCollectsAWSAzureAndGCP(t *testing.T) {
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")

	mustWriteFile(t, filepath.Join(home, ".aws", "config"), "[profile sandbox]\nregion = us-east-1\nsso_start_url = https://example.awsapps.com/start\n")
	mustWriteFile(t, filepath.Join(home, ".aws", "credentials"), "[sandbox]\naws_access_key_id = AKIAEXAMPLE\n")
	mustWriteFile(t, filepath.Join(home, ".azure", "azureProfile.json"), "{\"subscriptions\":[{\"id\":\"sub-001\",\"name\":\"Marketing\",\"tenantId\":\"tenant-123\",\"user\":{\"name\":\"ali@example.com\"}}]}")
	mustWriteFile(t, filepath.Join(home, ".config", "gcloud", "configurations", "config_default"), "[core]\naccount = ali@example.com\nproject = platform\n")

	settings := config.FromEnv(map[string]string{}, "linux", home)
	service := New(settings, func(command string) (string, error) {
		switch command {
		case "aws":
			return "/usr/bin/aws", nil
		case "az":
			return "/usr/bin/az", nil
		case "gcloud":
			return "/usr/bin/gcloud", nil
		default:
			return "", nil
		}
	})

	snapshot, err := service.Discover()
	if err != nil {
		t.Fatalf("expected discovery to succeed, got %v", err)
	}
	if len(snapshot.Providers) != 3 {
		t.Fatalf("expected 3 providers, got %d", len(snapshot.Providers))
	}
	if len(snapshot.Profiles) != 3 {
		t.Fatalf("expected 3 profiles, got %d", len(snapshot.Profiles))
	}

	awsProfile := snapshot.Profiles[0]
	if awsProfile.ProviderID != "aws" {
		t.Fatalf("expected aws profile first, got %s", awsProfile.ProviderID)
	}
	if !awsProfile.AuthMethods[1].Available {
		t.Fatalf("expected aws sso auth method to be available, got %+v", awsProfile.AuthMethods)
	}
}

func mustWriteFile(t *testing.T, path string, contents string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("failed to create directory for %s: %v", path, err)
	}
	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatalf("failed to write %s: %v", path, err)
	}
}
