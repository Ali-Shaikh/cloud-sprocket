// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package config

import (
	"os"
	"path/filepath"
	"runtime"
)

const (
	AppName = "CloudSprocket"
)

type Settings struct {
	PlatformName       string
	HomeDir            string
	AppDataDir         string
	LocalAppDataDir    string
	ConfigDir          string
	RuntimeMode        string
	LocalConfigDir     string
	EmulatorStateDir   string
	LocalStackImage    string
	FlociAZImage       string
	FlociAZEndpoint    string
	AWSConfigPath      string
	AWSCredentialsPath string
	AzureDir           string
	GCloudDir          string
	DatabasePath       string
	LogPath            string
	ToolsDir           string
	TofuPath           string
	DeploymentsDir     string
	ImportedRecipesDir string
	SecretKeyPath      string
}

func Default() Settings {
	return FromEnv(currentEnv(), runtime.GOOS, homeDir())
}

func FromEnv(env map[string]string, goos string, home string) Settings {
	platform := normalisePlatform(goos)
	appDataDir, localAppDataDir, configDir, gcloudDir := platformDefaults(platform, home)

	if platform == "windows" {
		appDataDir = firstNonEmpty(env["APPDATA"], appDataDir)
		localAppDataDir = firstNonEmpty(env["LOCALAPPDATA"], localAppDataDir)
		configDir = filepath.Join(localAppDataDir, AppName)
		gcloudDir = filepath.Join(appDataDir, "gcloud")
	} else {
		appDataDir = firstNonEmpty(env["XDG_CONFIG_HOME"], appDataDir)
		localAppDataDir = firstNonEmpty(env["XDG_CACHE_HOME"], localAppDataDir)
		if platform == "macos" {
			configDir = filepath.Join(appDataDir, AppName)
			gcloudDir = filepath.Join(home, ".config", "gcloud")
		} else {
			configDir = filepath.Join(appDataDir, "cloudsprocket")
			gcloudDir = filepath.Join(appDataDir, "gcloud")
		}
	}

	configDir = firstNonEmpty(env["CLOUDSPROCKET_CONFIG_DIR"], configDir)
	runtimeMode := firstNonEmpty(env["CLOUDSPROCKET_RUNTIME_MODE"], "cloud")
	localConfigDir := firstNonEmpty(env["CLOUDSPROCKET_LOCAL_CONFIG_DIR"], filepath.Join(configDir, "local-config"))
	emulatorStateDir := firstNonEmpty(env["CLOUDSPROCKET_EMULATOR_STATE_DIR"], filepath.Join(configDir, "emulators"))
	localStackImage := firstNonEmpty(env["CLOUDSPROCKET_LOCALSTACK_IMAGE"], "localstack/localstack:stable")
	flociAZImage := firstNonEmpty(env["CLOUDSPROCKET_FLOCI_AZ_IMAGE"], "floci/floci-az:latest")
	flociAZEndpoint := firstNonEmpty(env["CLOUDSPROCKET_FLOCI_AZ_ENDPOINT"], "http://localhost:4577")
	awsConfig := firstNonEmpty(env["AWS_CONFIG_FILE"], filepath.Join(home, ".aws", "config"))
	awsCredentials := firstNonEmpty(env["AWS_SHARED_CREDENTIALS_FILE"], filepath.Join(home, ".aws", "credentials"))
	azureDir := firstNonEmpty(env["AZURE_CONFIG_DIR"], filepath.Join(home, ".azure"))
	gcloudDir = firstNonEmpty(env["CLOUDSDK_CONFIG"], gcloudDir)
	toolsDir := firstNonEmpty(env["CLOUDSPROCKET_TOOLS_DIR"], filepath.Join(configDir, "tools"))
	tofuPath := env["CLOUDSPROCKET_TOFU_PATH"]
	deploymentsDir := firstNonEmpty(env["CLOUDSPROCKET_DEPLOYMENTS_DIR"], filepath.Join(configDir, "deployments"))
	importedRecipesDir := firstNonEmpty(env["CLOUDSPROCKET_IMPORTED_RECIPES_DIR"], filepath.Join(configDir, "recipes", "imported"))
	secretKeyPath := firstNonEmpty(env["CLOUDSPROCKET_SECRET_KEY_PATH"], filepath.Join(configDir, "secret.key"))

	return Settings{
		PlatformName:       platform,
		HomeDir:            home,
		AppDataDir:         appDataDir,
		LocalAppDataDir:    localAppDataDir,
		ConfigDir:          configDir,
		RuntimeMode:        runtimeMode,
		LocalConfigDir:     localConfigDir,
		EmulatorStateDir:   emulatorStateDir,
		LocalStackImage:    localStackImage,
		FlociAZImage:       flociAZImage,
		FlociAZEndpoint:    flociAZEndpoint,
		AWSConfigPath:      awsConfig,
		AWSCredentialsPath: awsCredentials,
		AzureDir:           azureDir,
		GCloudDir:          gcloudDir,
		DatabasePath:       filepath.Join(configDir, "cloudsprocket.db"),
		LogPath:            filepath.Join(configDir, "logs", "cloudsprocket.log"),
		ToolsDir:           toolsDir,
		TofuPath:           tofuPath,
		DeploymentsDir:     deploymentsDir,
		ImportedRecipesDir: importedRecipesDir,
		SecretKeyPath:      secretKeyPath,
	}
}

func (s Settings) EnsureRuntimeDirs() error {
	for _, directory := range []string{filepath.Dir(s.LogPath), s.LocalConfigDir, s.EmulatorStateDir, s.ToolsDir, s.DeploymentsDir, s.ImportedRecipesDir} {
		if err := os.MkdirAll(directory, 0o755); err != nil {
			return err
		}
	}
	return nil
}

func (s Settings) AzureProfilePath() string {
	return filepath.Join(s.AzureDir, "azureProfile.json")
}

func (s Settings) GCloudConfigDir() string {
	return filepath.Join(s.GCloudDir, "configurations")
}

func normalisePlatform(goos string) string {
	switch goos {
	case "windows":
		return "windows"
	case "darwin":
		return "macos"
	default:
		return "linux"
	}
}

func platformDefaults(platform string, home string) (string, string, string, string) {
	switch platform {
	case "windows":
		appData := filepath.Join(home, "AppData", "Roaming")
		localAppData := filepath.Join(home, "AppData", "Local")
		return appData, localAppData, filepath.Join(localAppData, AppName), filepath.Join(appData, "gcloud")
	case "macos":
		appData := filepath.Join(home, "Library", "Application Support")
		localAppData := filepath.Join(home, "Library", "Caches")
		return appData, localAppData, filepath.Join(appData, AppName), filepath.Join(home, ".config", "gcloud")
	default:
		appData := filepath.Join(home, ".config")
		localAppData := filepath.Join(home, ".cache")
		return appData, localAppData, filepath.Join(appData, "cloudsprocket"), filepath.Join(appData, "gcloud")
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func currentEnv() map[string]string {
	env := map[string]string{}
	for _, pair := range os.Environ() {
		if index := indexRune(pair, '='); index > 0 {
			env[pair[:index]] = pair[index+1:]
		}
	}
	return env
}

func homeDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "."
	}
	return home
}

func indexRune(value string, target rune) int {
	for index, candidate := range value {
		if candidate == target {
			return index
		}
	}
	return -1
}
