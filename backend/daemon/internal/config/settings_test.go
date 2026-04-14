package config

import (
	"path/filepath"
	"testing"
)

func TestFromEnvUsesWindowsOverrides(t *testing.T) {
	home := filepath.Join("C:", "Users", "Ali")
	settings := FromEnv(map[string]string{
		"APPDATA":                     filepath.Join(home, "Roaming"),
		"LOCALAPPDATA":                filepath.Join(home, "Local"),
		"CLOUDSPROCKET_CONFIG_DIR":    filepath.Join(home, "ConfigRoot"),
		"AWS_CONFIG_FILE":             filepath.Join(home, "custom", "config"),
		"AWS_SHARED_CREDENTIALS_FILE": filepath.Join(home, "custom", "credentials"),
	}, "windows", home)

	if settings.ConfigDir != filepath.Join(home, "ConfigRoot") {
		t.Fatalf("expected config override, got %s", settings.ConfigDir)
	}
	if settings.DatabasePath != filepath.Join(home, "ConfigRoot", "cloudsprocket.db") {
		t.Fatalf("expected database path in config dir, got %s", settings.DatabasePath)
	}
	if settings.AWSConfigPath != filepath.Join(home, "custom", "config") {
		t.Fatalf("expected custom aws config path, got %s", settings.AWSConfigPath)
	}
}

func TestFromEnvUsesMacOSDefaults(t *testing.T) {
	home := filepath.Join("/Users", "ali")
	settings := FromEnv(map[string]string{}, "darwin", home)

	expectedConfigDir := filepath.Join(home, "Library", "Application Support", AppName)
	if settings.ConfigDir != expectedConfigDir {
		t.Fatalf("expected macOS config dir %s, got %s", expectedConfigDir, settings.ConfigDir)
	}
	if settings.GCloudConfigDir() != filepath.Join(home, ".config", "gcloud", "configurations") {
		t.Fatalf("unexpected gcloud config dir %s", settings.GCloudConfigDir())
	}
}
