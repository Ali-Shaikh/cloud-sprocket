package config

import (
	"path/filepath"
	"testing"
)

func TestFromEnvUsesWindowsOverrides(t *testing.T) {
	home := filepath.Join("C:", "Users", "Ali")
	settings := FromEnv(map[string]string{
		"APPDATA":                          filepath.Join(home, "Roaming"),
		"LOCALAPPDATA":                     filepath.Join(home, "Local"),
		"CLOUDSPROCKET_CONFIG_DIR":         filepath.Join(home, "ConfigRoot"),
		"CLOUDSPROCKET_RUNTIME_MODE":       "local-emulator",
		"CLOUDSPROCKET_LOCAL_CONFIG_DIR":   filepath.Join(home, "LocalProfiles"),
		"CLOUDSPROCKET_EMULATOR_STATE_DIR": filepath.Join(home, "EmulatorState"),
		"AWS_CONFIG_FILE":                  filepath.Join(home, "custom", "config"),
		"AWS_SHARED_CREDENTIALS_FILE":      filepath.Join(home, "custom", "credentials"),
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
	if settings.RuntimeMode != "local-emulator" {
		t.Fatalf("expected runtime mode override, got %s", settings.RuntimeMode)
	}
	if settings.LocalConfigDir != filepath.Join(home, "LocalProfiles") {
		t.Fatalf("expected local config override, got %s", settings.LocalConfigDir)
	}
	if settings.EmulatorStateDir != filepath.Join(home, "EmulatorState") {
		t.Fatalf("expected emulator state override, got %s", settings.EmulatorStateDir)
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
	if settings.LocalConfigDir != filepath.Join(expectedConfigDir, "local-config") {
		t.Fatalf("unexpected local config dir %s", settings.LocalConfigDir)
	}
	if settings.EmulatorStateDir != filepath.Join(expectedConfigDir, "emulators") {
		t.Fatalf("unexpected emulator state dir %s", settings.EmulatorStateDir)
	}
}
